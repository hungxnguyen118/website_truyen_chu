
import fs from 'fs';
import path from 'path';

const filePath = 'output/vo-thuong-sat-than/story.json';

const stream = fs.createReadStream(filePath, { start: 0, end: 1000, encoding: 'utf8' });

stream.on('data', (chunk) => {
    console.log('First 1000 chars:');
    console.log(chunk);
    process.exit(0);
});
