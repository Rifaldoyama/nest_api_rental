import { Injectable, OnModuleInit } from '@nestjs/common';
import * as Minio from 'minio';

@Injectable()
export class MinioService {
  private client: Minio.Client;
  private bucket: string;

  constructor() {
    if (!process.env.MINIO_BUCKET) {
      throw new Error('MINIO_BUCKET is not defined');
    }

    this.bucket = process.env.MINIO_BUCKET;

    this.client = new Minio.Client({
      endPoint: process.env.MINIO_ENDPOINT!,
      port: Number(process.env.MINIO_PORT),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY!,
      secretKey: process.env.MINIO_SECRET_KEY!,
    });
  }

  async upload(file: Express.Multer.File, path: string) {
    const objectName = `${path}/${Date.now()}-${file.originalname}`;

    await this.client.putObject(
      this.bucket,
      objectName,
      file.buffer,
      file.size,
      {
        'Content-Type': file.mimetype,
      },
    );

    return objectName;
  }
  async delete(objectName: string) {
    try {
      await this.client.removeObject(this.bucket, objectName);
      return true;
    } catch (error) {
      console.error(`Gagal menghapus file ${objectName} di Minio:`, error);
      return false;
    }
  }

  async getFileUrl(objectName: string) {
    try {
      // Generate URL yang berlaku selama 1 jam (3600 detik)
      return await this.client.presignedGetObject(
        this.bucket,
        objectName,
        3600,
      );
    } catch (error) {
      console.error('Gagal generate URL Minio:', error);
      return null;
    }
  }
}
