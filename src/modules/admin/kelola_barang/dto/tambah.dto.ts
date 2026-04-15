import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateBarangDto {
  @IsString()
  @IsNotEmpty({ message: 'Nama barang wajib diisi' })
  nama: string;

  @IsOptional()
  @IsString()
  deskripsi?: string;

  @IsInt({ message: 'Harga sewa harus berupa angka' })
  @Min(0, { message: 'Harga sewa tidak boleh negatif' })
  harga_sewa: number;

  @IsString()
  @IsNotEmpty({ message: 'Kategori wajib dipilih' })
  kategoriId: string;

  @IsInt({ message: 'Stok harus berupa angka' })
  @Min(0, { message: 'Stok tidak boleh negatif' })
  stok_total: number;

  @IsOptional()
  @IsString()
  gambar?: string;

  @IsIn(['pcs', 'unit', 'meter', 'set', 'kg'], {
    message: 'Satuan harus salah satu dari: pcs, unit, meter, set, kg',
  })
  satuan: string;

  @IsOptional()
  @IsInt()
  @Min(0, { message: 'Denda tidak boleh negatif' })
  denda_telat_per_hari?: number;
}
