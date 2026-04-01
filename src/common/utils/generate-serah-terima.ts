import PDFDocument from 'pdfkit';
import type { Response } from 'express';

export function generateSuratSerahTerima(res: Response, p: any) {
  const doc = new PDFDocument({ margin: 50 });

  res.setHeader(
    'Content-Disposition',
    `attachment; filename=surat-serah-terima-${p.id}.pdf`,
  );
  res.setHeader('Content-Type', 'application/pdf');

  doc.pipe(res);

  doc.on('end', () => res.end());

  /* ================= HEADER ================= */

  doc.fontSize(18).text('SURAT SERAH TERIMA BARANG', { align: 'center' });

  doc.moveDown(2);

  /* ================= DATA PEMINJAM ================= */

  doc.fontSize(12).text('DATA PEMINJAM', { underline: true });
  doc.moveDown(0.5);

  doc.text(`Nama              : ${p.user.detail.nama_lengkap}`);
  doc.text(`No HP             : ${p.user.detail.no_hp}`);
  doc.text(`Alamat Acara      : ${p.alamat_acara || '-'}`);
  doc.text(`Metode Ambil      : ${p.metode_ambil}`);
  doc.text(`Zona Pengiriman   : ${p.zona?.nama || '-'}`);
  doc.text(`Biaya Zona        : Rp ${p.zona?.biaya?.toLocaleString() || 0}`);

  doc.moveDown();

  doc.text(`Tanggal Mulai     : ${formatDate(p.tanggal_mulai)}`);
  doc.text(`Tanggal Selesai   : ${formatDate(p.tanggal_selesai)}`);

  doc.moveDown(2);

  /* ================= DAFTAR BARANG ================= */

  doc.fontSize(12).text('DAFTAR BARANG', { underline: true });
  doc.moveDown(0.5);

  p.items.forEach((item: any, i: number) => {
    doc.text(
      `${i + 1}. ${item.barang.nama} (${item.jumlah} pcs) - Rp ${(
        item.harga_satuan * item.jumlah
      ).toLocaleString()}`,
    );
  });

  doc.moveDown(2);

  /* ================= RINCIAN BIAYA ================= */

  doc.fontSize(12).text('RINCIAN BIAYA', { underline: true });
  doc.moveDown(0.5);

  doc.text(`Total Sewa        : Rp ${p.total_sewa.toLocaleString()}`);
  doc.text(`Biaya Tambahan    : Rp ${p.biaya_tambahan.toLocaleString()}`);
  doc.text(`Deposit           : Rp ${p.deposit.toLocaleString()}`);
  doc.text(`Denda             : Rp ${p.denda.toLocaleString()}`);
  doc.text(`Total Biaya       : Rp ${p.total_biaya.toLocaleString()}`);
  doc.text(`Nominal DP        : Rp ${p.nominal_dp.toLocaleString()}`);
  doc.text(`Sisa Tagihan      : Rp ${p.sisa_tagihan.toLocaleString()}`);
  doc.text(`Status Pembayaran : ${p.status_bayar}`);

  doc.moveDown(2);

  /* ================= TRANSAKSI PEMBAYARAN ================= */

  doc.fontSize(12).text('TRANSAKSI PEMBAYARAN', { underline: true });
  doc.moveDown(0.5);

  if (p.pembayaran.length === 0) {
    doc.text('Belum ada transaksi');
  } else {
    p.pembayaran.forEach((trx: any, i: number) => {
      doc.text(
        `${i + 1}. ${trx.tipe} - Rp ${trx.jumlah.toLocaleString()} (${trx.metode}) - ${trx.status}`,
      );
    });
  }

  doc.moveDown(2);

  /* ================= JAMINAN ================= */

  doc.fontSize(12).text('DATA JAMINAN', { underline: true });
  doc.moveDown(0.5);

  doc.text(`Tipe Jaminan      : ${p.jaminan_tipe || '-'}`);
  doc.text(`Detail Jaminan    : ${p.jaminan_detail || '-'}`);

  doc.moveDown(3);

  /* ================= TANDA TANGAN ================= */

  doc.text('Barang telah diterima dalam kondisi baik.');
  doc.moveDown(3);

  doc.text('Tanda Tangan Peminjam: ___________________________');
  doc.moveDown();
  doc.text('Tanda Tangan Petugas : ___________________________');

  doc.end();
}

/* ================= FORMAT TANGGAL ================= */

function formatDate(date: Date) {
  return new Date(date).toLocaleString('id-ID');
}
