// Dosya içeriği doğrulama motoru (saf): biçim / kodlama bulma, CSV (ayraç, BOM, Windows-1254), XLSX, PDF (düz ve Flate akış,
// ToUnicode, şifreli, metinsiz), düz metin; beklenti türleri, başvuru çözümü, maskeleme ve tanım doğrulama.
import { expect, test } from '@playwright/test';
import {
  adDesenineUyar, ayracBul, bicimBul, dosyaIceriginiOku, dosyaTanimiDogrula, dosyayiDogrula, kalanlarMetni, metinCoz, metniNormallestir,
  pdfMetni, sonucOzeti, xlsxOku, yanitDosyaAdi, type DosyaTanimi
} from '../../scripts/platform/dosyalar/dosya-icerigi.mjs';
import { mesajiNormallestir } from '../support/beklenen-sonuc';
import { pdfUret, windows1254, xlsxUret } from './dosya-fikstur';

const tanim = (beklentiler: unknown[], ek: Record<string, unknown> = {}): DosyaTanimi => {
  const r = dosyaTanimiDogrula({ bicim: 'otomatik', ...ek, beklentiler });
  expect(r.hatalar).toEqual([]);
  return r.tanim;
};

const CSV_METNI = 'Sipariş No;Ürün;Adet;Tutar\n1001;Kırmızı Kalem;3;"45,00"\n1002;"Defter; çizgili";1;20,50\n\n';

test('biçim bulma: imza, ad ve içerik türü; eski / şifreli Office açık hata', () => {
  expect(bicimBul({ ad: 'x.bin', veri: Buffer.from('%PDF-1.4') })).toBe('pdf');
  expect(bicimBul({ ad: 'x', veri: Buffer.from([0x50, 0x4b, 3, 4]) })).toBe('xlsx');
  expect(bicimBul({ ad: 'rapor.CSV', veri: Buffer.from('a,b') })).toBe('csv');
  expect(bicimBul({ ad: 'yanit', icerikTuru: 'text/csv; charset=utf-8', veri: Buffer.from('a,b') })).toBe('csv');
  expect(bicimBul({ ad: 'not.txt', veri: Buffer.from('merhaba') })).toBe('metin');
  expect(bicimBul({ ad: 'not.txt', veri: Buffer.from('a;b') }, 'csv')).toBe('csv');
  expect(() => bicimBul({ ad: 'liste.xlsx', veri: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0]) })).toThrow(/şifreli .*eski Excel/);
});

test('kodlama: UTF-8, UTF-8-BOM ve Windows-1254 otomatik bulunur; ayraç bulunur', () => {
  const duz = metinCoz(Buffer.from(CSV_METNI, 'utf8'));
  expect(duz).toMatchObject({ kodlama: 'utf8' });
  const bom = metinCoz(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(CSV_METNI, 'utf8')]));
  expect(bom.kodlama).toBe('utf8bom');
  expect(bom.metin.startsWith('Sipariş')).toBe(true);
  const w = metinCoz(windows1254('Ağaç İşçi ğüşıöç ĞÜŞİÖÇ'));
  expect(w).toEqual({ metin: 'Ağaç İşçi ğüşıöç ĞÜŞİÖÇ', kodlama: 'windows1254' });
  expect(ayracBul(CSV_METNI)).toBe(';');
  expect(ayracBul('a,b,"c;d"\n1,2,3')).toBe(',');
  expect(ayracBul('a\tb\tc')).toBe('\t');
});

test('CSV: tırnaklı hücreler, başlık, boş satır sayılmaz; üç kodlamada aynı sonuç', () => {
  for (const veri of [Buffer.from(CSV_METNI, 'utf8'), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(CSV_METNI, 'utf8')]), windows1254(CSV_METNI)]) {
    const i = dosyaIceriginiOku(veri, 'csv');
    expect(i.tablo?.baslik).toEqual(['Sipariş No', 'Ürün', 'Adet', 'Tutar']);
    expect(i.tablo?.satirlar).toEqual([['1001', 'Kırmızı Kalem', '3', '45,00'], ['1002', 'Defter; çizgili', '1', '20,50']]);
    expect(i.bilgi.ayrac).toBe(';');
  }
  const baslıksiz = dosyaIceriginiOku(Buffer.from('a,b\nc,d\n'), 'csv', { baslikSatiri: false });
  expect(baslıksiz.tablo).toEqual({ baslik: [], satirlar: [['a', 'b'], ['c', 'd']] });
  const cokSatirli = dosyaIceriginiOku(Buffer.from('Ad,Not\r\nKalem,"iki\r\nsatır ""tırnak"""\r\n'), 'csv');
  expect(cokSatirli.tablo?.satirlar).toEqual([['Kalem', 'iki\r\nsatır "tırnak"']]);
});

test('XLSX: ortak metin, satır içi metin, sayı, mantıksal, boş hücre; sayfa adıyla seçim', () => {
  const veri = xlsxUret([
    { ad: 'Siparişler', satirlar: [['Sipariş No', 'Ürün', 'Adet', 'Onaylı'], ['1001', 'Kırmızı Kalem', 3, true], ['1002', null, 1, false]] },
    { ad: 'Özet', satirlar: [['Toplam', 'İşlem'], [65.5, 'Tamamlandı']] }
  ]);
  const ilk = xlsxOku(veri);
  expect(ilk.sayfa).toBe('Siparişler');
  expect(ilk.satirlar).toEqual([['Sipariş No', 'Ürün', 'Adet', 'Onaylı'], ['1001', 'Kırmızı Kalem', '3', 'TRUE'], ['1002', '', '1', 'FALSE']]);
  expect(xlsxOku(veri, 'özet').satirlar).toEqual([['Toplam', 'İşlem'], ['65.5', 'Tamamlandı']]);
  expect(() => xlsxOku(veri, 'Yok')).toThrow(/"Yok" adında sayfa yok \(sayfalar: Siparişler, Özet\)/);
  expect(() => xlsxOku(Buffer.from('PK\u0003\u0004 bozuk'))).toThrow(/XLSX okunamadı/);
});

test('PDF: düz ve Flate akış, TJ dizisi, çok sayfa; ToUnicode eşlemesiyle Türkçe; şifreli ve metinsiz açık hata', () => {
  const satirlar = [['Fatura No: 2024-0042', 'Toplam tutar: 145,90 TL', 'Tesekkur ederiz'], ['Sayfa 2 - Kargo bilgisi']];
  for (const sikistir of [false, true]) {
    const m = pdfMetni(pdfUret(satirlar, { sikistir }));
    expect(m).toContain('Fatura No: 2024-0042');
    expect(m).toContain('Toplam tutar: 145,90 TL');
    expect(m.indexOf('Tesekkur')).toBeLessThan(m.indexOf('Sayfa 2'));
  }
  const tr = pdfMetni(pdfUret([['Sipariş özeti: Ağaç oyuncak', 'Müşteri: Işıl Çağlar']], { sikistir: true, cmap: true }));
  expect(tr).toContain('Sipariş özeti: Ağaç oyuncak');
  expect(tr).toContain('Müşteri: Işıl Çağlar');
  expect(() => pdfMetni(pdfUret(satirlar, { sifreli: true }))).toThrow('PDF şifreli (parola korumalı); metin çıkarılamadı.');
  expect(() => pdfMetni(pdfUret(satirlar, { metinsiz: true }))).toThrow(/metin çıkarılamadı: .*taranmış görüntü/);
  expect(() => pdfMetni(Buffer.from('merhaba'))).toThrow(/PDF değil/);
});

test('normalleştirme koşucunun beklenen sonuç kuralıyla aynıdır (tek kaynak)', () => {
  for (const m of ['İSTANBUL  “Kalem”', 'KDV Dahil', 'ışık IŞIK']) expect(metniNormallestir(m)).toBe(mesajiNormallestir(m));
  expect(metniNormallestir('ISPARTA')).toBe(metniNormallestir('ısparta'));
  expect(adDesenineUyar('Siparis_Raporu_2024.CSV', 'sipariş_raporu_*.csv')).toBe(false);
  expect(adDesenineUyar('Sipariş_Raporu_2024.CSV', 'sipariş_raporu_*.csv')).toBe(true);
  expect(adDesenineUyar('fatura-7.pdf', 'fatura-?.pdf')).toBe(true);
  expect(adDesenineUyar('fatura-17.pdf', 'fatura-?.pdf')).toBe(false);
});

test('beklenti türleri: CSV üzerinde geçen ve kalanlar Beklenen / Görülen ile', () => {
  const dosya = { ad: 'siparis-raporu.csv', veri: Buffer.from(CSV_METNI, 'utf8') };
  const t = tanim([
    { tur: 'adDeseni', deger: 'SİPARİS-*.CSV' },
    { tur: 'adDeseni', deger: 'fatura*.pdf' },
    { tur: 'enAzBoyut', deger: 10 },
    { tur: 'enAzBoyut', deger: 1_000_000 },
    { tur: 'icerir', deger: 'kirmizi kalem' },
    { tur: 'icerir', deger: 'Mavi Silgi' },
    { tur: 'icermez', deger: 'HATA' },
    { tur: 'icermez', deger: 'defter' },
    { tur: 'sutunVar', deger: 'ürün' },
    { tur: 'sutunVar', deger: 'Kargo' },
    { tur: 'satirSayisi', islem: 'esit', deger: 2 },
    { tur: 'satirSayisi', islem: 'enAz', deger: 3 },
    { tur: 'hucre', sutun: 'Tutar', deger: '20,50', satir: { tur: 'kosul', sutun: 'Sipariş No', deger: '1002' } },
    { tur: 'hucre', sutun: 'Tutar', deger: '99,00', satir: { tur: 'kosul', sutun: 'Sipariş No', deger: '1001' } },
    { tur: 'hucre', sutun: 'B', deger: 'KIRMIZI KALEM', satir: { tur: 'no', no: 1 } },
    { tur: 'hucre', sutun: 'Adet', deger: '1' },
    { tur: 'hucre', sutun: 'Tutar', deger: '1', satir: { tur: 'no', no: 9 } }
  ]);
  const r = dosyayiDogrula(dosya, t);
  expect(r.beklentiler.map((b) => b.gecti)).toEqual([true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, true, false]);
  expect(r.gecti).toBe(false);
  expect(r.dosya).toMatchObject({ ad: 'siparis-raporu.csv', bicim: 'csv', kodlama: 'utf8', ayrac: ';', satirSayisi: 2, sutunlar: ['Sipariş No', 'Ürün', 'Adet', 'Tutar'] });
  const b = (i: number) => r.beklentiler[i];
  expect(b(1)).toMatchObject({ beklenen: 'ad: fatura*.pdf', gorulen: 'ad: siparis-raporu.csv' });
  expect(b(5).gorulen).toMatch(/^bulunamadı; dosyanın başı: Sipariş No;Ürün/);
  expect(b(7).gorulen).toMatch(/^geçiyor: .*Defter; çizgili/);
  expect(b(9).gorulen).toBe('sütunlar: Sipariş No, Ürün, Adet, Tutar');
  expect(b(11)).toMatchObject({ beklenen: 'en az 3 satır', gorulen: '2 satır (başlık hariç)' });
  expect(b(13)).toMatchObject({ beklenen: '"Tutar" = "99,00"', gorulen: '"Tutar": "45,00"' });
  expect(b(16).gorulen).toBe('dosyada 2 satır var; 9. satır yok');
  expect(sonucOzeti(r)).toBe('siparis-raporu.csv (CSV, 95 bayt) · 9/17 beklenti geçti');
  const hata = kalanlarMetni('Rapor indirilir', r);
  expect(hata.split('\n')[0]).toBe('Rapor indirilir adımında beklenen sonuç doğrulanamadı.');
  expect(hata.split('\n')[1]).toBe('Beklenen: "ad: fatura*.pdf" — Görülen: "ad: siparis-raporu.csv"');
  expect(hata).toContain('Ayrıca — Beklenen: "en az 3 satır" — Görülen: "2 satır (başlık hariç)"');
});

test('XLSX / PDF / metin üzerinde beklentiler; tablo beklentisi PDF\'te anlaşılır kalır; okuma hatası ad / boyutu engellemez', () => {
  const xlsx = { ad: 'stok.xlsx', veri: xlsxUret([{ ad: 'Stok', satirlar: [['Ürün', 'Depo', 'Adet'], ['Kalem', 'Ankara', 120], ['Silgi', 'İzmir', 0]] }]) };
  const rx = dosyayiDogrula(xlsx, tanim([{ tur: 'hucre', sutun: 'adet', deger: '0', satir: { tur: 'kosul', sutun: 'Depo', deger: 'izmir' } }, { tur: 'satirSayisi', islem: 'esit', deger: 2 }, { tur: 'icerir', deger: 'Kalem Ankara 120' }]));
  expect(rx.gecti).toBe(true);
  expect(rx.dosya).toMatchObject({ bicim: 'xlsx', sayfa: 'Stok' });
  const pdf = { ad: 'fatura.pdf', veri: pdfUret([['Fatura No: 2024-0042', 'Toplam tutar: 145,90 TL']], { sikistir: true }) };
  const rp = dosyayiDogrula(pdf, tanim([{ tur: 'icerir', deger: 'toplam TUTAR: 145,90' }, { tur: 'sutunVar', deger: 'Tutar' }]));
  expect(rp.beklentiler.map((b) => b.gecti)).toEqual([true, false]);
  expect(rp.beklentiler[1].gorulen).toMatch(/dosya bir tablo değil \(PDF\)/);
  const sifreli = { ad: 'gizli.pdf', veri: pdfUret([['x']], { sifreli: true }) };
  const rs = dosyayiDogrula(sifreli, tanim([{ tur: 'adDeseni', deger: '*.pdf' }, { tur: 'icerir', deger: 'x' }]));
  expect(rs.beklentiler.map((b) => [b.gecti, b.gorulen])).toEqual([[true, 'ad: gizli.pdf'], [false, 'PDF şifreli (parola korumalı); metin çıkarılamadı.']]);
  expect(rs.okumaHatasi).toBe('PDF şifreli (parola korumalı); metin çıkarılamadı.');
  const metin = { ad: 'gunluk.txt', veri: windows1254('Gönderim tamamlandı: 3 paket\nİade yok') };
  expect(dosyayiDogrula(metin, tanim([{ tur: 'icerir', deger: 'GÖNDERİM TAMAMLANDI' }, { tur: 'icermez', deger: 'iptal' }])).gecti).toBe(true);
});

test('başvurular coz() ile çözülür; çözülemeyen başvuru beklentiyi kaldırır; gizli değerler ve gizli adlı sütun maskelenir', () => {
  const veri = Buffer.from('Müşteri,Parola,Kupon\nAli Veli,Gizli1234,YAZ2024\n', 'utf8');
  const degerler: Record<string, string> = { 'Kuponlar.Kod': 'YAZ2024', 'akis:SiparisNo': 'Ali Veli', musteriAdi: 'Ali Veli' };
  const t = tanim([
    { tur: 'icerir', deger: 'Kupon: ${Kuponlar.Kod}' },
    { tur: 'icerir', deger: '${Kuponlar.Kod}' },
    { tur: 'hucre', sutun: 'Kupon', deger: '${Kuponlar.Kod}', satir: { tur: 'kosul', sutun: 'Müşteri', deger: '${akis:SiparisNo}' } },
    { tur: 'icerir', deger: '${Yok.Sutun}' },
    { tur: 'hucre', sutun: 'Parola', deger: 'baska' }
  ]);
  const r = dosyayiDogrula({ ad: 'kupon.csv', veri }, t, { coz: (i) => degerler[i], gizliler: ['YAZ2024'] });
  expect(r.beklentiler.map((b) => b.gecti)).toEqual([false, true, true, false, false]);
  expect(r.beklentiler[3].gorulen).toBe('"${Yok.Sutun}" başvurusu çözülemedi (değer bu koşuda yok)');
  const tumu = JSON.stringify(r);
  expect(tumu).not.toContain('YAZ2024');
  expect(tumu).not.toContain('Gizli1234');
  expect(r.beklentiler[4].gorulen).toBe('"Parola": "•••"');
  expect(r.beklentiler[0].gorulen).toContain('•••');
});

test('tanım doğrulama: tür, zorunlu alanlar, sınırlar, tablo beklentisi PDF\'te reddedilir', () => {
  expect(dosyaTanimiDogrula({ beklentiler: [] }).hatalar).toEqual(['Dosya için en az bir beklenti ekleyin (ör. metin içeriyor).']);
  const r = dosyaTanimiDogrula({
    bicim: 'pdf', ayrac: ':', kodlama: 'latin5', zamanAsimiSn: 0,
    beklentiler: [{ tur: 'bilinmez' }, { tur: 'icerir', deger: ' ' }, { tur: 'enAzBoyut', deger: 0 }, { tur: 'sutunVar', deger: 'A' },
      { tur: 'hucre', sutun: 'A', deger: 'x', satir: { tur: 'no', no: 0 } }, { tur: 'satirSayisi', deger: -1 }]
  });
  expect(r.hatalar).toEqual([
    'CSV ayracı otomatik, virgül, noktalı virgül, sekme ya da dikey çizgi olmalı.',
    'Kodlama otomatik, UTF-8, UTF-8-BOM ya da Windows-1254 olmalı.',
    'İndirmeyi bekleme süresi 1–600 saniye arasında tam sayı olmalı.',
    '1. beklenti: türü tanınmadı.',
    '2. beklenti: aranacak metni yazın.',
    '3. beklenti: en az boyut 1 – 52428800 bayt arasında tam sayı olmalı.',
    '4. beklenti: sütun / satır beklentileri yalnız CSV ve XLSX dosyalarında kullanılır.',
    '5. beklenti: sütun / satır beklentileri yalnız CSV ve XLSX dosyalarında kullanılır.',
    '6. beklenti: sütun / satır beklentileri yalnız CSV ve XLSX dosyalarında kullanılır.'
  ]);
  const temiz = dosyaTanimiDogrula({ bicim: 'csv', ayrac: ';', baslikSatiri: false, fazla: 1, tetikleyici: { secici: '#indir', aciklama: 'İndir' },
    beklentiler: [{ tur: 'satirSayisi', islem: 'enAz', deger: '3', fazla: true }, { tur: 'hucre', sutun: 'A', deger: '', satir: { tur: 'kosul', sutun: 'B', deger: 'x' } }] });
  expect(temiz).toEqual({ hatalar: [], tanim: { bicim: 'csv', ayrac: ';', baslikSatiri: false, tetikleyici: { secici: '#indir', aciklama: 'İndir' },
    beklentiler: [{ tur: 'satirSayisi', islem: 'enAz', deger: 3 }, { tur: 'hucre', sutun: 'A', deger: '', satir: { tur: 'kosul', sutun: 'B', deger: 'x' } }] } });
});

test('yanıt dosya adı: Content-Disposition (filename*, filename) ya da adresin son parçası', () => {
  expect(yanitDosyaAdi({ 'Content-Disposition': "attachment; filename*=UTF-8''Sipari%C5%9F%20listesi.csv" })).toBe('Sipariş listesi.csv');
  expect(yanitDosyaAdi({ 'content-disposition': 'attachment; filename="fatura.pdf"' })).toBe('fatura.pdf');
  expect(yanitDosyaAdi({}, 'http://127.0.0.1:1/api/rapor/stok.xlsx?x=1')).toBe('stok.xlsx');
  expect(yanitDosyaAdi(undefined, 'yok')).toBe('yanit');
});
