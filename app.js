const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const url = 'https://github.com/chokcoco/iCSS/issues/226';

// Helper function to generate random filename
function generateRandomName(length = 10) {
    return crypto.randomBytes(length)
        .toString('hex')
        .slice(0, length);
}

async function getPageContentAndImages() {
    try {
        // Create images directory if it doesn't exist
        const imagesDir = path.join(__dirname, 'images');
        if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir);
        }

        // Fetch the page content
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);

        // Find the specific element and get its content
        const contentElement = $('.d-block.comment-body.markdown-body.js-comment-body');
        
        // Create a map to store image URL to filename mappings
        const imageMap = new Map();
        
        // First pass: collect all images and download them
        const images = [];
        contentElement.find('img').each((i, element) => {
            const src = $(element).attr('src');
            if (src) {
                images.push(src);
            }
        });

        console.log(`Found ${images.length} images in the content`);

        // Download images first and build the mapping
        for (let i = 0; i < images.length; i++) {
            const imageUrl = images[i];
            const randomName = generateRandomName();
            const filename = `${randomName}${path.extname(imageUrl.split('?')[0])}`;
            const filepath = path.join(imagesDir, filename);

            // Store the mapping
            imageMap.set(imageUrl, filename);

            // Download image
            const imageResponse = await axios({
                url: imageUrl,
                method: 'GET',
                responseType: 'stream'
            });

            const writer = fs.createWriteStream(filepath);
            imageResponse.data.pipe(writer);

            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            console.log(`Downloaded: ${filename}`);
        }

        // Process the content more carefully
        let markdown = '';
        
        // Second pass: process content with image replacements
        contentElement.children().each((i, element) => {
            const $el = $(element);
            
            // Handle different types of elements
            if ($el.is('pre')) {
                // Code blocks
                const $code = $el.find('code');
                const language = $code.attr('class')?.match(/language-(\w+)/)?.[1] || '';
                const codeContent = $code.text().trim();
                markdown += `\n\`\`\`${language}\n${codeContent}\n\`\`\`\n\n`;
            }
            else if ($el.is('p')) {
                // Check if paragraph contains images
                if ($el.find('img').length > 0) {
                    let content = $el.html();
                    
                    // Replace each image with its markdown reference
                    $el.find('img').each((j, img) => {
                        const $img = $(img);
                        const src = $img.attr('src');
                        const alt = $img.attr('alt') || '';
                        const filename = imageMap.get(src);
                        if (filename) {
                            const imgMarkdown = `![${alt}](./images/${filename})`;
                            content = content.replace($img.toString(), imgMarkdown);
                        }
                    });

                    // Process other inline elements
                    content = content
                        .replace(/<code>(.*?)<\/code>/g, '`$1`')
                        .replace(/<strong>(.*?)<\/strong>/g, '**$1**')
                        .replace(/<em>(.*?)<\/em>/g, '*$1*')
                        .replace(/<a href="(.*?)".*?>(.*?)<\/a>/g, '[$2]($1)')
                        .replace(/<br\s*\/?>/g, '\n')
                        .replace(/<[^>]+>/g, ''); // Remove any remaining HTML tags

                    markdown += content + '\n\n';
                } else {
                    // Regular paragraph with potential inline elements
                    let content = $el.html()
                        .replace(/<code>(.*?)<\/code>/g, '`$1`')
                        .replace(/<strong>(.*?)<\/strong>/g, '**$1**')
                        .replace(/<em>(.*?)<\/em>/g, '*$1*')
                        .replace(/<a href="(.*?)".*?>(.*?)<\/a>/g, '[$2]($1)')
                        .replace(/<br\s*\/?>/g, '\n');
                    
                    // Remove any remaining HTML tags
                    content = content.replace(/<[^>]+>/g, '');
                    markdown += content + '\n\n';
                }
            }
            else if ($el.is('h1, h2, h3, h4, h5, h6')) {
                // Headers
                const level = parseInt($el.prop('tagName').replace('H', ''));
                const content = $el.text().trim();
                markdown += '#'.repeat(level) + ' ' + content + '\n\n';
            }
            else if ($el.is('ul, ol')) {
                // Lists
                $el.find('li').each((j, li) => {
                    const prefix = $el.is('ul') ? '- ' : `${j + 1}. `;
                    const content = $(li).text().trim();
                    markdown += prefix + content + '\n';
                });
                markdown += '\n';
            }
            else if ($el.is('blockquote')) {
                // Blockquotes
                const content = $el.text().trim();
                markdown += '> ' + content + '\n\n';
            }
            else if ($el.is('div.highlight')) {
                // Highlighted code blocks
                const content = $el.text().trim();
                const language = $el.find('code').attr('class')?.match(/language-(\w+)/)?.[1] || '';
                markdown += `\n\`\`\`${language}\n${content}\n\`\`\`\n\n`;
            }
        });

        // Clean up the markdown
        markdown = markdown
            .replace(/\n\s*\n\s*\n/g, '\n\n')  // Remove extra blank lines
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&nbsp;/g, ' ')
            .trim();

        // Write markdown content to file
        fs.writeFileSync(path.join(__dirname, 'content.md'), markdown, 'utf8');

        console.log('Content has been extracted and saved to content.md');
        console.log('All images have been downloaded to the images directory');
    } catch (error) {
        console.error('Error:', error.message);
    }
}

// Helper function to escape special characters in string for RegExp
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

getPageContentAndImages();