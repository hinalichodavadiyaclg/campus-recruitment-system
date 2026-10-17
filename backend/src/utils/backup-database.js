import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function backupDatabase() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/campus_recruitment';
  const conn = await mongoose.createConnection(uri).asPromise();
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.resolve(__dirname, '..', 'backups', `backup_campus_recruitment_${timestamp}`);
  fs.mkdirSync(backupDir, { recursive: true });

  const collections = await conn.db.listCollections().toArray();
  const manifest = {
    sourceDatabase: conn.name,
    uri,
    createdAt: new Date().toISOString(),
    collections: {}
  };

  for (const collInfo of collections) {
    const collName = collInfo.name;
    const docs = await conn.db.collection(collName).find({}).toArray();
    const filePath = path.join(backupDir, `${collName}.json`);
    fs.writeFileSync(filePath, JSON.stringify(docs, null, 2), 'utf-8');
    manifest.collections[collName] = {
      count: docs.length,
      file: `${collName}.json`
    };
  }

  fs.writeFileSync(path.join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
  console.log(`Backup completed successfully to: ${backupDir}`);
  console.log(JSON.stringify(manifest, null, 2));

  await conn.close();
}

backupDatabase().catch((err) => {
  console.error('Backup failed:', err);
  process.exit(1);
});
