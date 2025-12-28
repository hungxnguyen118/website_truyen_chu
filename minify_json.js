
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const directoryPath = path.join(__dirname, 'output');

function minifyJsonFiles(dir) {
    if (!fs.existsSync(dir)) {
        console.log(`Directory not found: ${dir}`);
        return;
    }

    const files = fs.readdirSync(dir);

    files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            minifyJsonFiles(filePath);
        } else if (path.extname(file) === '.json') {
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                const json = JSON.parse(content);
                const minified = JSON.stringify(json);
                const originalSize = fs.statSync(filePath).size;
                fs.writeFileSync(filePath, minified);
                const newSize = fs.statSync(filePath).size;

                if (originalSize > 1024 * 1024) { // Log files > 1MB
                    console.log(`Minified ${filePath}: ${(originalSize / 1024 / 1024).toFixed(2)} MB -> ${(newSize / 1024 / 1024).toFixed(2)} MB`);
                }
            } catch (err) {
                console.error(`Error minifying ${filePath}:`, err.message);
            }
        }
    });
}

console.log('Starting minification...');
minifyJsonFiles(directoryPath);
console.log('Minification complete.');
