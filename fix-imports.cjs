const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');
const oldPrismaDir = path.join(__dirname, 'prisma');
const newPrismaDir = path.join(srcDir, 'prisma');

// Buat direktori src/prisma kalau belum ada
if (!fs.existsSync(newPrismaDir)) {
    fs.mkdirSync(newPrismaDir, { recursive: true });
}

// Pindahkan file service dan module
const filesToMove = ['prisma.module.ts', 'prisma.service.ts'];

for (const file of filesToMove) {
    const oldPath = path.join(oldPrismaDir, file);
    const newPath = path.join(newPrismaDir, file);
    if (fs.existsSync(oldPath)) {
        fs.renameSync(oldPath, newPath);
        console.log(`Moved ${file} to src/prisma/`);
    }
}

// Update imports di seluruh folder src
function replaceInDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            replaceInDir(fullPath);
        } else if (fullPath.endsWith('.ts')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            const originalContent = content;
            
            // Ganti "from 'prisma/..." atau 'from "prisma/..." menjadi "from 'src/prisma/..."
            content = content.replace(/from\s+['"]prisma\/(.*?)['"]/g, "from 'src/prisma/$1'");
            
            if (content !== originalContent) {
                fs.writeFileSync(fullPath, content);
                console.log(`Updated imports in: ${fullPath.replace(__dirname, '')}`);
            }
        }
    }
}

replaceInDir(srcDir);
console.log("\nSelesai! Silakan coba jalankan ulang:");
console.log("rm -rf dist");
console.log("npm run build");
console.log("npm run start");
