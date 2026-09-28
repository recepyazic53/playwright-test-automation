// KORUMA TESTLERİ — PDF raporu A2: birden çok ekran, birden çok servis, ekran + servis (veritabanı fikstürüyle; ağ YOK).
// Denetlenenler: öğe sonuçlarının toplanması (oran toplamdan), önceki eşit dönem karşılaştırması, sağlık sıralaması, birleşik
// sorun ve aksiyon listesi, bağlantılı sorun (ekran ↔ servis) ve tek aksiyonda birleşme, "tümü" ve sonradan silinen öğe, girdi
// doğrulama; maskeleme (gizli değer, e-posta, uzun rakam, ortam adresi, gövde HTML'de yok); PDF (%PDF, sayfa > 0, dış istek yok);
// arşiv (kaydet → meta, aynı seçimlerle yeniden oluştur).
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { pdfDosyaAdi, raporGirdisiDogrula, raporHazirla, raporPdf, raporSecenekleri, raporYenidenOlustur } from '../../scripts/platform/sonuclar/rapor-uclari.mjs';
import { raporlariListele } from '../../scripts/platform/sonuclar/rapor-arsivi.mjs';
import { pdfTarayicisiniKapat } from '../../scripts/platform/sonuclar/pdf-rapor/pdf.mjs';
import { HIZLI_KDF } from './platform-ortak';
import { RAPOR_SIMDI, SIZINTILAR, cokluGirdi, cokluVeriKur, raporVerisiKur, type CokluFikstur } from './pdf-rapor-fikstur';

test.describe.configure({ mode: 'serial' });

let klasor = '';
let medya = '';
let vt: Veritabani;
let f: CokluFikstur;
const b = () => ({ medyaKlasoru: medya, simdi: RAPOR_SIMDI });
const hazirla = (g: Record<string, unknown>) => raporHazirla(vt, raporGirdisiDogrula(g), b());

test.beforeAll(async () => {
  klasor = mkdtempSync(join(tmpdir(), 'pdf-rapor-coklu-'));
  medya = join(klasor, 'medya');
  vt = await veritabaniniHazirla(join(klasor, 'platform.db'));
  await kasaOlustur(vt, `Gecici-${randomBytes(6).toString('hex')}`, { kdf: HIZLI_KDF });
  f = cokluVeriKur(vt, raporVerisiKur(vt));
});

test.afterAll(async () => {
  await pdfTarayicisiniKapat();
  vt?.kapat();
  if (klasor) rmSync(klasor, { recursive: true, force: true });
});

test('çoklu ekran: sayılar toplanır (oran toplamdan), önceki dönem, sağlık sıralaması, birleşik sorunlar, kapsam', async () => {
  const { veri: v, dosyaAdi } = await hazirla(cokluGirdi(f, 'coklu-ekran'));
  expect(v.tur).toBe('coklu-ekran');
  expect(v.oge.ad).toBe('Seçilen 2 ekran');
  expect(dosyaAdi).toBe('nobetci-rapor-coklu-ekran-secilen-2-ekran-2026-09-28.pdf');
  const et = v.coklu!.ekranTarafi!;
  expect(v.coklu!.servisTarafi).toBeNull();
  // Başvuru 90 test (58 geçti, 18 kaldı, 14 atlandı) + Talep 28 test (26 geçti, 2 kaldı).
  expect(et.ozet).toMatchObject({ test: 118, basarisiz: 20, atlanan: 14, oncekiTest: 112, oncekiBasarisiz: 13, tamKosu: 34, ogeSayisi: 2, hatasizOge: 0, oncekiHatasizOge: 1, kararsizSenaryo: 1 });
  expect(et.ozet.basari).toBeCloseTo((84 / 118) * 100, 5);
  expect(et.ozet.oncekiBasari).toBeCloseTo((85 / 112) * 100, 5);
  expect(v.ozet.basari).toBe(et.ozet.basari);
  // Oranların ortalaması DEĞİL: (64,4 + 92,9) / 2 ≠ 71,2.
  expect(Math.abs((et.ozet.basari ?? 0) - ((58 / 90) * 100 + (26 / 28) * 100) / 2)).toBeGreaterThan(1);
  // Sağlık sıralaması: Başvuru (Kritik, %64,4) önce, Talep (Sağlıklı, %92,9) sonra.
  expect(et.ogeler.map((o) => [o.sira, o.ad, o.rozet.durum])).toEqual([[1, 'Başvuru', 'kritik'], [2, 'Talep', 'saglikli']]);
  const talep = et.ogeler[1];
  expect(talep).toMatchObject({ test: 28, basarisiz: 2, oncekiTest: 28, oncekiBasarisiz: 0, acikSorun: 1, kotulesen: 1, son: 'G' });
  expect(talep.basari).toBeCloseTo((26 / 28) * 100, 5);
  expect(talep.oncekiBasari).toBe(100);
  expect(talep.oranSeri).toHaveLength(14);
  expect(talep.kapsam).toMatchObject({ senaryo: 2, kosuyaDahil: 2, hicKosmayan: 0, hepAtlanan: 0 });
  // Sorunlar: Başvuru'nun 7 sorunu + Talep'in 1 yeni sorunu; her sorun öğesini bilir.
  expect(v.sorunlar).toHaveLength(8);
  const gonder = v.sorunlar.find((s) => s.nerede === 'Talep › Gönder');
  expect(gonder).toMatchObject({ durum: 'yeni', n: 2, nOnceki: 0, sinif: 'ortam', ogeId: f.ekran2Id, ogeAd: 'Talep' });
  expect(v.durumSayim).toMatchObject({ yeni: 2, artan: 1, azalan: 1, tekrar: 1, suregelen: 1, kararsiz: 1, cozulen: 1 });
  // Aksiyonlar puana göre (her iki ekrandan) + "her koşuda atlanan" ek aksiyon.
  expect(v.aksiyonlar.map((a) => a.puan)).toEqual([...v.aksiyonlar.map((a) => a.puan)].sort((x, y) => y - x));
  expect(v.bantSayim.P1 + v.bantSayim.P2 + v.bantSayim.P3).toBe(8);
  expect(v.rozet.durum).toBe('kritik');
  // Eğilim kovaları toplanır: 12. gün Başvuru 12 + Talep 2.
  expect(v.egilim.kovalar[12].adet).toBe(14);
  expect(v.egilim.kovalar[2]).toMatchObject({ adet: 8, kalan: 2 }); // Başvuru 6 (Kayıt kaldı: 1) + Talep 2 (1 kaldı)
  // Sınıf dağılımı ve en çok hata veren adımlar.
  const dagilim = v.coklu!.sinifDagilimi;
  expect(dagilim.find((x) => x.ad === 'Talep')).toMatchObject({ toplam: 2, sayilar: { ortam: 2 } });
  expect(dagilim.find((x) => x.ad === 'Başvuru')?.toplam).toBe(19); // 18 tam + 1 tekil kalan
  expect(v.coklu!.enCokAdim[0]).toMatchObject({ nerede: 'Başvuru › Onayla', n: 6 });
  // Sağlık sıralaması maddesi.
  expect(v.maddeler.some(([t, x]) => t === 'kotu' && x.startsWith('En çok ilgi isteyen ekran: Başvuru'))).toBe(true);
  expect(v.maddeler.some(([t, x]) => t === 'iyi' && x.startsWith('En sağlıklı ekran: Talep'))).toBe(true);
});

test('çoklu servis: toplam, metotlar (servisli), yavaşlayan, akışlar, sıralama', async () => {
  const { veri: v } = await hazirla(cokluGirdi(f, 'coklu-servis'));
  const st = v.coklu!.servisTarafi!;
  expect(v.coklu!.ekranTarafi).toBeNull();
  expect(st.ozet).toMatchObject({ cagri: 85, kalan: 5, oncekiCagri: 84, oncekiKalan: 4, yavaslayan: 1, ogeSayisi: 2, metotSayisi: 3, hatasizOge: 1 });
  expect(st.ozet.basari).toBeCloseTo((80 / 85) * 100, 5);
  expect(st.ozet.oncekiBasari).toBeCloseTo((80 / 84) * 100, 5);
  expect(st.ozet.enYavas).toMatchObject({ metot: 'Kayıt Servisi › POST /kayit', p95: 450 });
  expect(st.ozet.akisKosu).toBe(2);
  expect(st.ozet.akisBasari).toBe(50);
  expect(st.metotlar.map((m) => `${m.servis} › ${m.ad}`).sort()).toEqual(['Bildirim Servisi › bildirimGonder', 'Kayıt Servisi › GET /kayit/${id}', 'Kayıt Servisi › POST /kayit']);
  expect(st.yavaslayanlar).toEqual([expect.objectContaining({ servis: 'Kayıt Servisi', metot: 'POST /kayit', oncekiP95: 200, p95: 450 })]);
  expect(st.hataMatrisi.find((r) => r.servis === 'Bildirim Servisi')).toMatchObject({ metot: 'bildirimGonder', toplam: 0, onceki: 1 });
  // İkisi de sağlıklı: düşük başarı önce.
  expect(st.ogeler.map((o) => [o.sira, o.ad, o.rozet.durum])).toEqual([[1, 'Kayıt Servisi', 'saglikli'], [2, 'Bildirim Servisi', 'saglikli']]);
  expect(st.ogeler[1]).toMatchObject({ cagri: 28, kalan: 0, oncekiCagri: 28, oncekiKalan: 1, basari: 100, tur: 'soap', p95: 100 });
  expect(st.ogeler[0]).toMatchObject({ p95: 450, oncekiP95: 300, yavaslayan: 1 });
  expect(v.coklu!.akislar).toEqual([expect.objectContaining({ ad: 'Kayıt akışı', kosu: 2, basari: 50 })]);
  expect(v.sorunlar.find((s) => s.ogeAd === 'Bildirim Servisi')).toMatchObject({ durum: 'cozulen', nOnceki: 1 });
  expect(st.sureEgilimi.p95).toHaveLength(14);
  expect(v.rozet.durum).toBe('saglikli');
});

test('ekran + servis: taraflar ayrı, rozet düşük taraftan, bağlantılı sorun tek aksiyonda, birleşik öncelik listesi', async () => {
  const { veri: v, html } = await hazirla(cokluGirdi(f, 'karisik'));
  const c = v.coklu!;
  expect(v.oge.ad).toBe('Seçilen 2 ekran + seçilen 2 servis');
  expect(c.ekranTarafi?.ozet.test).toBe(118);
  expect(c.servisTarafi?.ozet.cagri).toBe(85);
  expect(v.ozet).toMatchObject({ taraf: 'ekran', acikSorun: 6 + 1 + 2, baglantili: 1 });
  expect(v.ozet.basari).toBe(c.ekranTarafi?.ozet.basari);
  expect(v.rozet.durum).toBe('kritik');
  expect(v.rozet.gerekce).toContain('Ekran başarısı');
  // Tek bağlantılı çift: Talep › Gönder ↔ Kayıt Servisi › POST /kayit HTTP 5xx (aynı iki gün).
  expect(c.baglantili).toHaveLength(1);
  expect(c.baglantili[0]).toMatchObject({ ortak: 2, birlesim: 2, jaccard: 1, birlesti: true, ekran: { nerede: 'Talep › Gönder' }, servis: { nerede: 'Kayıt Servisi › POST /kayit' } });
  const imzalar = [c.baglantili[0].ekran.imza, c.baglantili[0].servis.imza];
  const listede = v.aksiyonlar.filter((a) => imzalar.includes(String((a as { imza?: string }).imza)));
  expect(listede).toHaveLength(1);
  expect(listede[0].baglanti).toBeTruthy();
  // Birleşik öncelik listesi: ekran ve servis sorunları birlikte, puana göre (bantlar birleşmeden sonra sayılır).
  expect(new Set(v.aksiyonlar.map((a) => (a as { tur?: string }).tur))).toEqual(new Set(['ekran', 'servis', 'ek']));
  expect(v.aksiyonlar.map((a) => a.puan)).toEqual([...v.aksiyonlar.map((a) => a.puan)].sort((x, y) => y - x));
  expect(v.bantSayim.P1 + v.bantSayim.P2 + v.bantSayim.P3).toBe(9 + 1 - 1); // 9 açık sorun + 1 ek − 1 birleşen
  expect(c.sinifDagilimi.map((x) => x.tur).sort()).toEqual(['ekran', 'ekran', 'servis']);
  expect(html).toContain('Ekran ve servis tarafı');
  expect(html).toContain('Bağlantılı sorunlar (ekran ↔ servis)');
  expect(html).toContain('⇄ Bağlantılı sorunla birleştirildi');
  expect(html).toContain('<th scope="col" style="width:52px">Tür</th>');
  expect(html).toContain('Birleşik Rapor — Ekranlar ve Servisler');
});

test('tümü, sonradan silinen öğe ve karşılaştırmasız rapor', async () => {
  const { veri: tum } = await hazirla(cokluGirdi(f, 'coklu-ekran', { ekranIdleri: [], tumEkranlar: true }));
  expect(tum.oge.ad).toBe('Tüm ekranlar');
  expect(tum.secilenler).toMatchObject({ tumEkranlar: true, eksik: 0 });
  expect(tum.secilenler!.ekranlar.map((x) => x.ad)).toEqual(['Başvuru', 'Talep']);
  expect(tum.coklu!.ekranTarafi!.ozet.test).toBe(118);
  const { veri: eksik, html } = await hazirla(cokluGirdi(f, 'coklu-servis', { servisIdleri: [f.servisId, 'silinmis-servis'] }));
  expect(eksik.secilenler).toMatchObject({ eksik: 1 });
  expect(eksik.coklu!.servisTarafi!.ozet.cagri).toBe(57);
  expect(html).toContain('Seçimdeki 1 öğe artık projede yok');
  await expect(hazirla(cokluGirdi(f, 'coklu-servis', { servisIdleri: ['yok1', 'yok2'] }))).rejects.toThrow('Seçilen servisler bulunamadı');
  // Başka projenin öğesi seçilemez (bulunamayan sayılır).
  await expect(hazirla({ ...cokluGirdi(f, 'coklu-ekran'), projeId: f.baskaProjeId })).rejects.toThrow('Seçilen ekranlar bulunamadı');
  const { html: kapali } = await hazirla(cokluGirdi(f, 'karisik', { karsilastir: false }));
  expect(kapali).toContain('<b>Karşılaştırılan dönem</b>Kapalı');
  expect(kapali).not.toContain('önceki dönem ortalaması');
});

test('girdi doğrulama (çoklu), seçenekler ve dosya adı', () => {
  expect(() => raporGirdisiDogrula({ ...cokluGirdi(f, 'coklu-ekran'), ekranIdleri: [f.ekranId] })).toThrow('En az iki ekran');
  expect(() => raporGirdisiDogrula({ ...cokluGirdi(f, 'coklu-servis'), servisIdleri: [] })).toThrow('En az iki servis');
  expect(() => raporGirdisiDogrula({ ...cokluGirdi(f, 'karisik'), servisIdleri: [] })).toThrow('En az bir servis');
  expect(() => raporGirdisiDogrula({ ...cokluGirdi(f, 'karisik'), ekranIdleri: ['../x'] })).toThrow('geçersiz');
  expect(() => raporGirdisiDogrula({ ...cokluGirdi(f, 'coklu-ekran'), ekranIdleri: 'x' })).toThrow('liste olmalı');
  expect(() => raporGirdisiDogrula({ ...cokluGirdi(f, 'coklu-ekran'), ekranIdleri: Array.from({ length: 101 }, (_, i) => `e${i}`) })).toThrow('en çok 100');
  expect(() => raporGirdisiDogrula({ ...cokluGirdi(f, 'coklu-ekran'), kapsam: 'genel' })).toThrow('"Genel" sonraki aşamada');
  // Yinelenen kimlik atılır; kapsam dışı liste yok sayılır; "tümü" varken liste boş olabilir.
  expect(raporGirdisiDogrula({ ...cokluGirdi(f, 'coklu-ekran'), ekranIdleri: [f.ekranId, f.ekranId, f.ekran2Id] })).toMatchObject({
    id: '', ekranIdleri: [f.ekranId, f.ekran2Id], servisIdleri: [], tumEkranlar: false, tumServisler: false
  });
  expect(raporGirdisiDogrula({ projeId: f.projeId, kapsam: 'karisik', tumEkranlar: true, tumServisler: true })).toMatchObject({ tumEkranlar: true, tumServisler: true });
  expect(raporSecenekleri(vt, new URLSearchParams({ projeId: f.projeId })).kapsamlar).toEqual(['ekran', 'servis', 'coklu-ekran', 'coklu-servis', 'karisik']);
  expect(pdfDosyaAdi('karisik', 'Tüm ekranlar + tüm servisler', RAPOR_SIMDI)).toBe('nobetci-rapor-karisik-tum-ekranlar-tum-servisler-2026-09-28.pdf');
});

test('maskeleme: üç türün HTML\'inde gizli değer, e-posta, uzun rakam, ortam adresi ve gövde yok; güvenli HTML', async () => {
  for (const kapsam of ['coklu-ekran', 'coklu-servis', 'karisik'] as const) {
    for (const ek of [{}, { ortamId: f.ortamId }, { secenekler: { hatalar: true, adres: true, goruntuler: false }, ortamId: f.ortamId }]) {
      const { html } = await hazirla(cokluGirdi(f, kapsam, ek));
      const adresli = 'secenekler' in ek;
      for (const sizinti of SIZINTILAR) {
        if (adresli && sizinti === 'test.ornek.invalid') continue; // adres seçilince ortam adresi (sorgu dizesi olmadan) görünür
        expect(html, `${kapsam} ${JSON.stringify(ek)}: ${sizinti}`).not.toContain(sizinti);
      }
      expect(html).not.toMatch(/<script/i);
      expect(html).not.toMatch(/(src|href)="https?:/i);
      expect(html).not.toMatch(/@import|url\(/i);
      expect(html).toContain("default-src 'none'");
      for (const bolum of ['Tek bakışta', 'Ele alınması gerekenler', 'Sorunlar ve eğilimleri', 'Eğilim', 'Kapsamdaki öğeler — sağlık sıralaması', 'Yöntem', 'Gizlilik.']) {
        expect(html, `${kapsam}: ${bolum}`).toContain(bolum);
      }
      if (adresli) expect(html).not.toContain('oturum=zzz');
    }
  }
  const { html } = await hazirla(cokluGirdi(f, 'coklu-ekran'));
  expect(html).toContain('parola=•••'); // Başvuru'nun adım adındaki gizli değer maskeli
  expect(html).toContain('Ekranlar Raporu — Seçilen 2 ekran');
  expect(html).toContain('Hata sınıfı dağılımı');
  expect(html).toContain('En çok hata veren adımlar');
});

test('PDF: üç tür için %PDF, sayfa > 0, dış istek yok; gizli değer PDF\'te yok', async () => {
  test.setTimeout(180_000);
  const ornek = process.env.PDF_RAPOR_ORNEK_KLASORU;
  for (const kapsam of ['coklu-ekran', 'coklu-servis', 'karisik'] as const) {
    const r = await raporPdf(vt, cokluGirdi(f, kapsam), b());
    expect(r.pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(r.sayfa).toBeGreaterThan(1);
    expect(r.engellenenIstek).toBe(0);
    for (const sizinti of SIZINTILAR) expect(r.pdf.toString('latin1')).not.toContain(sizinti);
    // İsteğe bağlı: görsel inceleme için örnek PDF + HTML (yalnız ortam değişkeni verilince).
    if (ornek) {
      writeFileSync(join(ornek, r.dosyaAdi), r.pdf);
      writeFileSync(join(ornek, `${kapsam}.html`), (await hazirla(cokluGirdi(f, kapsam))).html);
    }
  }
});

test('arşiv: çoklu seçim kaydedilir; aynı seçimlerle yeniden oluşturma listeyi ve "tümü"nü korur', async () => {
  test.setTimeout(180_000);
  const r = await raporPdf(vt, cokluGirdi(f, 'karisik', { kaydet: true, servisIdleri: [], tumServisler: true }), b());
  expect(r.raporId).toBeTruthy();
  const [satir] = raporlariListele(vt, f.projeId);
  expect(satir).toMatchObject({ kapsam: 'karisik' });
  expect(satir.meta).toMatchObject({
    kapsam: 'karisik', secim: { id: '', ad: 'Seçilen 2 ekran + tüm servisler', ekranIdleri: [f.ekranId, f.ekran2Id], servisIdleri: [], tumEkranlar: false, tumServisler: true,
      ogeler: ['Başvuru', 'Talep', 'Bildirim Servisi', 'Kayıt Servisi'] }, // servisler proje sırasıyla (sıra yoksa ada göre)
    ozet: { test: 118 + 85 }
  });
  const y = await raporYenidenOlustur(vt, { projeId: f.projeId, id: r.raporId }, { medyaKlasoru: medya, simdi: new Date(2026, 9, 5, 9) });
  const yeni = raporlariListele(vt, f.projeId).find((x) => x.id === y.raporId);
  expect(yeni?.kapsam).toBe('karisik');
  expect(yeni?.meta.secim).toEqual(satir.meta.secim);
  expect(yeni?.meta.donem).toMatchObject({ tur: 'son14', gun: 14 });
  const c = await raporPdf(vt, cokluGirdi(f, 'coklu-ekran', { kaydet: true }), b());
  const y2 = await raporYenidenOlustur(vt, { projeId: f.projeId, id: c.raporId }, b());
  expect(raporlariListele(vt, f.projeId).find((x) => x.id === y2.raporId)?.meta.secim).toMatchObject({ ekranIdleri: [f.ekranId, f.ekran2Id], tumEkranlar: false });
});
