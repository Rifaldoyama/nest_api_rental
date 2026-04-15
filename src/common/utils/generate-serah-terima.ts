import PDFDocument from 'pdfkit';
import type { Response } from 'express';

function safeCurrency(value: number | null | undefined) {
  return (value ?? 0).toLocaleString('id-ID');
}

function formatDate(date: Date | string) {
  return new Date(date).toLocaleString('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function generateSuratSerahTerima(res: Response, p: any) {
  const doc = new PDFDocument({ margin: 50 });

  res.setHeader(
    'Content-Disposition',
    `attachment; filename=surat-serah-terima-${p.id}.pdf`,
  );
  res.setHeader('Content-Type', 'application/pdf');

  doc.pipe(res);

  // Hitung ongkir dari biayaDetails
  const ongkir =
    p.biayaDetails?.find((b: any) => b.tipe === 'ONGKIR')?.jumlah || 0;
  const totalDenda = p.total_denda || 0;

  /* ================= HEADER ================= */
  doc.fontSize(18).text('SURAT SERAH TERIMA BARANG', { align: 'center' });
  doc.moveDown(2);

  /* ================= DATA PEMINJAM ================= */
  doc.fontSize(12).text('DATA PEMINJAM', { underline: true });
  doc.moveDown(0.5);

  doc.text(`Nama              : ${p.user?.detail?.nama_lengkap || '-'}`);
  doc.text(`No HP             : ${p.user?.detail?.no_hp || '-'}`);
  doc.text(`Alamat Acara      : ${p.alamat_acara || '-'}`);
  doc.text(
    `Metode Ambil      : ${p.metode_ambil === 'DIANTAR' ? 'Diantar' : 'Ambil Sendiri'}`,
  );

  if (p.metode_ambil === 'DIANTAR') {
    doc.text(`Zona Pengiriman   : ${p.zona?.nama || '-'}`);
    doc.text(`Biaya Ongkir      : Rp ${safeCurrency(ongkir)}`);
  }

  doc.moveDown();
  doc.text(`Tanggal Mulai     : ${formatDate(p.tanggal_mulai)}`);
  doc.text(`Tanggal Selesai   : ${formatDate(p.tanggal_selesai)}`);
  doc.moveDown(2);

  /* ================= DAFTAR BARANG ================= */
  doc.fontSize(12).text('DAFTAR BARANG', { underline: true });
  doc.moveDown(0.5);

  if (p.items && p.items.length > 0) {
    p.items.forEach((item: any, i: number) => {
      const namaBarang = item.barang?.nama || item.nama_barang_snapshot || '-';
      const jumlah = item.jumlah || 0;
      const hargaSatuan = item.harga_satuan || 0;
      const total = hargaSatuan * jumlah;

      doc.text(
        `${i + 1}. ${namaBarang} (${jumlah} pcs) - Rp ${total.toLocaleString('id-ID')}`,
      );
    });
  } else {
    doc.text('Tidak ada data barang');
  }

  doc.moveDown(2);

  /* ================= RINCIAN BIAYA ================= */
  doc.fontSize(12).text('RINCIAN BIAYA', { underline: true });
  doc.moveDown(0.5);

  doc.text(`Biaya Sewa        : Rp ${safeCurrency(p.total_sewa)}`);

  if (p.metode_ambil === 'DIANTAR') {
    doc.text(`Biaya Ongkir      : Rp ${safeCurrency(ongkir)}`);
  }

  doc.text(`Deposit           : Rp ${safeCurrency(p.deposit)}`);
  doc.text(`Total Denda       : Rp ${safeCurrency(totalDenda)}`);
  doc.text(`Total Biaya       : Rp ${safeCurrency(p.total_biaya)}`);
  doc.text(`Total Tagihan     : Rp ${safeCurrency(p.total_tagihan)}`);
  doc.text(`Nominal DP        : Rp ${safeCurrency(p.nominal_dp)}`);
  doc.text(`Sisa Tagihan      : Rp ${safeCurrency(p.sisa_tagihan)}`);
  doc.moveDown(2);

  /* ================= TRANSAKSI PEMBAYARAN ================= */
  doc.fontSize(12).text('TRANSAKSI PEMBAYARAN', { underline: true });
  doc.moveDown(0.5);

  if (!p.pembayaran || p.pembayaran.length === 0) {
    doc.text('Belum ada transaksi pembayaran');
  } else {
    p.pembayaran.forEach((trx: any, i: number) => {
      const statusText =
        trx.status === 'VERIFIED'
          ? '✓ Terverifikasi'
          : trx.status === 'REJECTED'
            ? '✗ Ditolak'
            : '⏳ Menunggu';
      doc.text(
        `${i + 1}. ${trx.tipe} - Rp ${trx.jumlah.toLocaleString('id-ID')} (${trx.metode}) - ${statusText}`,
      );
    });
  }

  doc.moveDown(2);

  /* ================= JAMINAN ================= */
  doc.fontSize(12).text('DATA JAMINAN', { underline: true });
  doc.moveDown(0.5);

  doc.text(`Tipe Jaminan      : ${p.jaminan_tipe || '-'}`);
  doc.text(`Detail Jaminan    : ${p.jaminan_detail || '-'}`);
  doc.text(
    `Status Jaminan    : ${p.jaminan_status === 'DIKEMBALIKAN' ? 'Sudah Dikembalikan' : 'Ditahan'}`,
  );

  doc.moveDown(3);

  /* ================= TANDA TANGAN ================= */
  doc.text('Barang telah diterima dalam kondisi baik dan lengkap.');
  doc.moveDown(3);

  doc.text(`Tanda Tangan Peminjam: ___________________________`);
  doc.moveDown();
  doc.text(`Tanda Tangan Petugas : ___________________________`);
  doc.moveDown();
  doc.text(`Tanggal               : ${formatDate(new Date())}`);

  doc.end();
}
