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
      useSSL: false,
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
}
