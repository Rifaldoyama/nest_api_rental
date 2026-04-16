import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class MinioService {
  private supabase: SupabaseClient;
  private bucket: string;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    const bucket = process.env.SUPABASE_BUCKET;

    if (!url) throw new Error('SUPABASE_URL is not defined');
    if (!key) throw new Error('SUPABASE_SERVICE_KEY is not defined');
    if (!bucket) throw new Error('SUPABASE_BUCKET is not defined');

    this.bucket = bucket;
    this.supabase = createClient(url, key);
  }

  async upload(file: Express.Multer.File, path: string): Promise<string> {
    const objectName = `${path}/${Date.now()}-${file.originalname}`;

    const { error } = await this.supabase.storage
      .from(this.bucket)
      .upload(objectName, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (error) {
      throw new Error(`Gagal upload file ke Supabase Storage: ${error.message}`);
    }

    return objectName;
  }

  async delete(objectName: string): Promise<boolean> {
    try {
      const { error } = await this.supabase.storage
        .from(this.bucket)
        .remove([objectName]);

      if (error) {
        console.error(`Gagal menghapus file ${objectName} di Supabase Storage:`, error.message);
        return false;
      }

      return true;
    } catch (error) {
      console.error(`Gagal menghapus file ${objectName} di Supabase Storage:`, error);
      return false;
    }
  }

  getFileUrl(objectName: string): string | null {
    try {
      const { data } = this.supabase.storage
        .from(this.bucket)
        .getPublicUrl(objectName);

      return data.publicUrl;
    } catch (error) {
      console.error('Gagal generate URL Supabase Storage:', error);
      return null;
    }
  }
}
