import { KondisiBarang } from '@prisma/client';

export function hitungPersentaseDenda(kondisi: KondisiBarang): number {
  switch (kondisi) {
    case KondisiBarang.RUSAK_RINGAN:
      return 0.2; // 20%
    case KondisiBarang.RUSAK_SEDANG:
      return 0.5; // 50%
    case KondisiBarang.RUSAK_BERAT:
      return 0.9; // 90%
    case KondisiBarang.HILANG:
      return 1; // 100%
    default:
      return 0;
  }
}