// KORUMA TESTLERİ — Ekranlar > ⋯ (ekran yönetimi; scripts/platform/ekranlar/ekran-yonetimi.mjs):
//   yeniden adlandır (anahtar sabit, geçmiş), düzenle (URL yolu → yeni model sürümü), sıralama, devre dışı bırak /
//   etkinleştir (koşu listesi: dosya + anahtar desenleri, veri-oku "durum" kipi kasa olmadan, ▷ reddi, model senaryosu),
//   kalıcı sil (sonuçlar korunur → mezar taşı; sonuçlar + kod kaldırma → tamamen silinir), mezar taşının etkisi
//   (koddaki testler hariç, "kodu kaldırılmış" uyarısı yok, yeniden aktarım geri getirmez), geri yükleme ve kod kaldırma
//   yol güvenliği (tests/scenarios dışı, "..", mutlak yol, dışarı çıkan sembolik bağ; kuru çalıştırma listesiyle eşleşme).
// Veri: SAHTE örnek eski dosyalar + SAHTE test listesi; test kodu GEÇİCİ bir klasörde (gerçek tests/scenarios'a dokunulmaz).
// Tarayıcı açmaz, siteye bağlanmaz.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { kasaOlustur, medyaAnahtariniHazirla } from '../../scripts/platform/kasa.mjs';
import { medyaSifrele } from '../../scripts/platform/medya.mjs';
import { ekranlariListele, ekranModeliGetir, senaryoKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { kosuKaydet, sonucKaydet, sonucOzeti } from '../../scripts/platform/veritabani/sonuc-deposu.mjs';
import { aktarimiUygula } from '../../scripts/platform/aktarim/motor.mjs';
import { kodKaldirilmisSenaryolar, senaryoListesi } from '../../scripts/platform/senaryolar/senaryo-servisi.mjs';
import { calistirmaIsteginiHazirla } from '../../scripts/platform/senaryolar/calistirma.mjs';
import {
  ekranDurumunuAyarla, ekranDuzenle, ekranGeriYukle, ekranHaricKapsami, ekranlariSirala, ekranSil, ekranSilmeOnizlemesi,
  ekranYenidenAdlandir, kodYolunuDenetle, urlYoluDogrula
} from '../../scripts/platform/ekranlar/ekran-yonetimi.mjs';
import { ekranListesi } from '../../scripts/platform/ekranlar/ekran-servisi.mjs';
import { adaptorBul } from '../../projeler/index.mjs';
import { anahtardanGrepDeseni, dosyadanGrepDeseni, kosuListesiHaricDesenleri } from '../support/kosu-listesi';
import { HIZLI_KDF, ORNEK_ESKI_DOSYALAR, SAHTE_ORTAM_DEGISKENLERI, geciciKlasor } from './platform-ortak';

const KOK = resolve(__dirname, '..', '..');
const PAROLA = 'Ekran-Yonetimi-Kasa-Parolasi-5';
const SATIS_SPEC = 'scenarios/jet-satis/urun-ekranlari.spec.ts';
const KASKO_SPEC = 'scenarios/jet-kasko/kod-testi.spec.ts';
/** SAHTE Playwright listesi (her iki ortam): Jet Satış kodda iki test; JetKasko bir kod testi + canlı kontrol. */
const LISTE = [
  { dosya: SATIS_SPEC, ad: 'Ürün A ekranı açılmalı' },
  { dosya: SATIS_SPEC, ad: 'Ürün B ekranı açılmalı' },
  { dosya: KASKO_SPEC, ad: 'Kasko kod testi' },
  { dosya: 'canli/jet-kasko.spec.ts', ad: 'Kasko canlı kontrolü' }
];

type Ortam = { vt: Veritabani; vtYolu: string; projeId: string; ortamId: string; kod: string; medya: string; temizle: () => void; paket: unknown };

/** Geçici veritabanı + geçici KOD kökü (tests/scenarios kopyası yerine sahte spec dosyaları). */
async function kur(): Promise<Ortam> {
  const k = geciciKlasor('ekran-yonetimi');
  const vtYolu = join(k.yol, 'platform.db');
  const vt = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  const adaptor = adaptorBul('galaksi');
  if (!adaptor) throw new Error('galaksi adaptörü yok');
  const paket = await adaptor.paketOlustur(ORNEK_ESKI_DOSYALAR, { projeKoku: KOK, ortamDegiskenleri: { ...SAHTE_ORTAM_DEGISKENLERI }, testListesi: async () => LISTE });
  const { projeId } = aktarimiUygula(vt, paket);
  const ortamId = String(vt.tek("SELECT varlik_id FROM kaynak_eslemeleri WHERE varlik_turu = 'ortam' AND kaynak_anahtari = 'test'")?.varlik_id);
  const kod = join(k.yol, 'kod');
  const yaz = (goreli: string, icerik = '// sahte\n') => { mkdirSync(join(kod, goreli, '..'), { recursive: true }); writeFileSync(join(kod, goreli), icerik); };
  yaz(`tests/${SATIS_SPEC}`);
  yaz('tests/scenarios/jet-satis/yardimci.ts');
  yaz(`tests/${KASKO_SPEC}`);
  yaz('tests/scenarios/jet-kasko/yeni-kayit.spec.ts');
  yaz('tests/canli/jet-kasko.spec.ts');
  return { vt, vtYolu, projeId, ortamId, kod, medya: join(k.yol, 'medya'), paket, temizle: () => { vt.kapat(); k.temizle(); } };
}

const ekranBul = (o: Ortam, anahtar: string) => {
  const e = ekranlariListele(o.vt, o.projeId, { silinenlerDahil: true }).find((x) => x.anahtar === anahtar);
  if (!e) throw new Error(`${anahtar} yok`);
  return e;
};
const senaryolar = (o: Ortam, ekranId: string) => o.vt.tumu('SELECT id, baslik FROM senaryolar WHERE ekran_id = ?', [ekranId]).map((s) => ({ id: String(s.id), baslik: String(s.baslik) }));
const kodDosyasiVar = (o: Ortam) => (d: string) => existsSync(join(o.kod, 'tests', d));
const gecmis = (o: Ortam, id: string) => o.vt.tumu("SELECT islem, aciklama FROM degisiklik_gecmisi WHERE varlik_turu = 'ekran' AND varlik_id = ? ORDER BY rowid", [id]);
/** Playwright'ın grep metni: " Chromium <dosya> <başlık>". */
const baslik = (dosya: string, ad: string) => ` Chromium ${dosya} ${ad}`;
function haricMi(o: Ortam, dosya: string, ad: string) {
  const k = ekranHaricKapsami(o.vt, o.projeId);
  return (kosuListesiHaricDesenleri(k.anahtarlar, k.dosyalar) ?? []).some((d) => d.test(baslik(dosya, ad)));
}

/** Şifreli medyalı bir sonuç (ekranın senaryosu için). */
async function sonucEkle(o: Ortam, senaryoId: string, kosuId: string) {
  const anahtar = medyaAnahtariniHazirla(o.vt);
  const { dosya, boyut } = await medyaSifrele(anahtar, o.medya, Buffer.from('sahte ekran görüntüsü'));
  anahtar.fill(0);
  kosuKaydet(o.vt, { id: kosuId, projeId: o.projeId, ortamId: o.ortamId, tur: 'tekil' });
  sonucKaydet(o.vt, {
    kosuId, projeId: o.projeId, senaryoId, senaryoBaslik: 'x', durum: 'basarisiz', hataMesaji: 'sahte hata',
    adimlar: [{ ad: 'adım', durum: 'basarisiz' }], medya: [{ tur: 'ekran_goruntusu', ad: 'g', icerikTuru: 'image/png', boyut, dosya }]
  });
  return dosya;
}

test.describe('Ekran yönetimi — ad, yol, sıra, durum', () => {
  test('yeniden adlandır: anahtar ve senaryo bağları sabit; çakışan ad reddedilir; geçmişe yazılır', async () => {
    const o = await kur();
    try {
      const satis = ekranBul(o, 'jet-satis');
      const onceki = senaryolar(o, satis.id);
      expect(onceki.length).toBe(2);
      expect(() => ekranYenidenAdlandir(o.vt, o.projeId, satis.id, { ad: '  ' })).toThrow(/boş olamaz/);
      expect(() => ekranYenidenAdlandir(o.vt, o.projeId, satis.id, { ad: 'jetkasko' })).toThrow(/başka bir ekran var/);
      const r = ekranYenidenAdlandir(o.vt, o.projeId, satis.id, { ad: '  Satış   Ekranları ', aciklama: 'Açıklama' });
      expect(r).toEqual({ degisti: true, ad: 'Satış Ekranları', aciklama: 'Açıklama' });
      const sonra = ekranBul(o, 'jet-satis');
      expect(sonra).toMatchObject({ id: satis.id, anahtar: 'jet-satis', ad: 'Satış Ekranları', aciklama: 'Açıklama' });
      expect(senaryolar(o, satis.id)).toEqual(onceki);
      expect(gecmis(o, satis.id)).toEqual([{ islem: 'guncelle', aciklama: 'Yeniden adlandırıldı: "Jet Satış" → "Satış Ekranları"' }]);
      expect(ekranYenidenAdlandir(o.vt, o.projeId, satis.id, { ad: 'Satış Ekranları', aciklama: 'Açıklama' }).degisti).toBe(false);
    } finally { o.temizle(); }
  });

  test('düzenle: URL yolu doğrulanır ve yalnızca ekranUrl değişen yeni model sürümü oluşur; modelsiz / alt modelde reddedilir', async () => {
    const o = await kur();
    try {
      for (const kotu of ['', 'satis', 'https://ornek.invalid/x', '//ornek.invalid/x', '/a b', '/a\\b']) expect(() => urlYoluDogrula(kotu)).toThrow();
      expect(urlYoluDogrula(' /satis/odeme/ ')).toBe('/satis/odeme/');
      const seyahat = ekranBul(o, 'jet-seyahat');
      const v1 = ekranModeliGetir(o.vt, seyahat.id);
      const r = ekranDuzenle(o.vt, o.projeId, seyahat.id, { urlYolu: '/yeni/seyahat/' });
      expect(r).toMatchObject({ degisti: true, surum: (v1?.surum ?? 0) + 1, urlYolu: '/yeni/seyahat/' });
      const v2 = ekranModeliGetir(o.vt, seyahat.id);
      expect({ ...v2?.model, ekranUrl: v1?.model.ekranUrl }).toEqual(v1?.model);
      expect(v2?.model.ekranUrl).toBe('/yeni/seyahat/');
      expect(ekranDuzenle(o.vt, o.projeId, seyahat.id, { urlYolu: '/yeni/seyahat/' }).degisti).toBe(false);
      expect(() => ekranDuzenle(o.vt, o.projeId, ekranBul(o, 'jet-satis').id, { urlYolu: '/x/' })).toThrow(/modeli yok/);
      expect(() => ekranDuzenle(o.vt, o.projeId, ekranBul(o, 'odeme-kredi-karti').id, { urlYolu: '/x/' })).toThrow(/Alt modellerin/);
    } finally { o.temizle(); }
  });

  test('sıralama: tüm ekranlar istenen sırada; eksik/bilinmeyen kimlik reddedilir', async () => {
    const o = await kur();
    try {
      const idler = ekranlariListele(o.vt, o.projeId).map((e) => e.id);
      expect(() => ekranlariSirala(o.vt, o.projeId, idler.slice(1))).toThrow(/tüm ekranların/);
      expect(() => ekranlariSirala(o.vt, o.projeId, [...idler.slice(1), 'yok'])).toThrow(/bilinmeyen/);
      const ters = idler.slice().reverse();
      expect(ekranlariSirala(o.vt, o.projeId, ters).degisti).toBe(true);
      expect(ekranlariListele(o.vt, o.projeId).map((e) => e.id)).toEqual(ters);
      expect(ekranListesi(o.vt, o.projeId).ekranlar.map((e) => e.id)).toEqual(ters);
    } finally { o.temizle(); }
  });

  test('devre dışı: ekranın dosyaları + paylaşılan dosyadaki testleri toplu koşudan hariç (▷ tek başına çalışır), kasa olmadan okunur; etkinleştirince geri döner', async () => {
    const o = await kur();
    try {
      const satis = ekranBul(o, 'jet-satis');
      const kasko = ekranBul(o, 'jet-kasko');
      // Paylaşılan dosya: Jet Satış'ın bir senaryosu JetKasko'nun spec dosyasında (etkin ekranla paylaşılır).
      const paylasilan = senaryoKaydet(o.vt, {
        projeId: o.projeId, ekranId: satis.id, baslik: 'Satış paylaşılan', kosuyaDahil: true,
        icerik: { kaynak: { dosya: KASKO_SPEC, ad: 'Satış paylaşılan' }, ortamlar: { [o.ortamId]: {} } }
      });
      expect(ekranHaricKapsami(o.vt, o.projeId)).toEqual({ dosyalar: [], anahtarlar: [] });
      expect(haricMi(o, SATIS_SPEC, 'Ürün A ekranı açılmalı')).toBe(false);

      expect(ekranDurumunuAyarla(o.vt, o.projeId, satis.id, false)).toEqual({ durum: 'devre_disi', degisti: true });
      const k = ekranHaricKapsami(o.vt, o.projeId);
      expect(k).toEqual({ dosyalar: [SATIS_SPEC], anahtarlar: [`${KASKO_SPEC}::Satış paylaşılan`] });
      // Dosya deseni: kodla sonradan eklenen testler de hariç; komşu klasör/dosya etkilenmez.
      expect(haricMi(o, SATIS_SPEC, 'Ürün A ekranı açılmalı')).toBe(true);
      expect(haricMi(o, SATIS_SPEC, 'Koda yeni eklenen test')).toBe(true);
      expect(haricMi(o, KASKO_SPEC, 'Satış paylaşılan')).toBe(true);
      expect(haricMi(o, KASKO_SPEC, 'Kasko kod testi')).toBe(false);
      expect(haricMi(o, 'scenarios/jet-satis-2/urun-ekranlari.spec.ts', 'Ürün A ekranı açılmalı')).toBe(false);
      expect(dosyadanGrepDeseni('../x.spec.ts')).toBeNull();
      expect(anahtardanGrepDeseni(`${KASKO_SPEC}::Satış paylaşılan`)?.test(baslik(KASKO_SPEC, 'Satış paylaşılan'))).toBe(true);

      // Senaryolar ekranı: satırlar "ekranEtkin: false"; Koşuyu başlat (tam) sunucuda reddedilir, tek senaryo (▷) çalışır.
      const liste = senaryoListesi(o.vt, o.projeId, o.ortamId, null, { kodDosyasiVar: kodDosyasiVar(o) });
      expect(liste.ekranlar.find((e) => e.id === satis.id)?.durum).toBe('devre_disi');
      expect(liste.senaryolar.filter((s) => s.ekranId === satis.id).every((s) => s.ekranEtkin === false)).toBe(true);
      expect(liste.senaryolar.filter((s) => s.ekranId === kasko.id).every((s) => s.ekranEtkin)).toBe(true);
      const govde = (senaryoId: string) => ({ projeId: o.projeId, ortamId: o.ortamId, senaryoId, kosuId: 'k1', kosuTuru: 'tam', kosuKimligi: 'toplu-1' });
      expect(() => calistirmaIsteginiHazirla(o.vt, govde(paylasilan))).toThrow(/devre dışı/);
      expect(() => calistirmaIsteginiHazirla(o.vt, { ...govde(paylasilan), kosuTuru: 'tekil' })).toThrow(/devre dışı/);
      expect(() => calistirmaIsteginiHazirla(o.vt, { ...govde(paylasilan), kosuTuru: 'tekil', tekBasina: true })).not.toThrow(/devre dışı/);
      expect(() => calistirmaIsteginiHazirla(o.vt, { ...govde(paylasilan), tekBasina: true })).toThrow(/devre dışı/);

      // veri-oku "durum" kipi (playwright.config.ts > grepInvert kaynağı) kasa parolası OLMADAN okur.
      const cikti = spawnSync(process.execPath, [join(KOK, 'scripts', 'platform', 'aktarim', 'veri-oku.mjs'), 'durum', '--adaptor', 'galaksi'], {
        cwd: KOK, encoding: 'utf8', env: { ...process.env, PLATFORM_VERITABANI: o.vtYolu, PLATFORM_KASA_PAROLASI: '', PLATFORM_KASA_ANAHTARI: '' }
      });
      const durum = JSON.parse(cikti.stdout.trim().split('\n').pop() ?? '{}') as { haricTutulanlar: string[]; haricTutulanDosyalar: string[] };
      expect(durum.haricTutulanDosyalar).toEqual([SATIS_SPEC]);
      expect(durum.haricTutulanlar).toContain(`${KASKO_SPEC}::Satış paylaşılan`);

      expect(ekranDurumunuAyarla(o.vt, o.projeId, satis.id, true).durum).toBe('etkin');
      expect(ekranHaricKapsami(o.vt, o.projeId)).toEqual({ dosyalar: [], anahtarlar: [] });
      expect(() => calistirmaIsteginiHazirla(o.vt, govde(paylasilan))).not.toThrow(/devre dışı/);
      expect(gecmis(o, satis.id).map((g) => g.aciklama)).toEqual(['Devre dışı bırakıldı (senaryoları koşulara girmez)', 'Etkinleştirildi']);
    } finally { o.temizle(); }
  });
});

test.describe('Ekran yönetimi — kalıcı sil', () => {
  test('yol güvenliği: yalnızca tests/scenarios; "..", mutlak yol, ters bölü ve dışarı çıkan sembolik bağ reddedilir', async () => {
    const o = await kur();
    try {
      const disari = join(o.kod, '..', 'disari');
      mkdirSync(disari, { recursive: true });
      writeFileSync(join(disari, 'x.spec.ts'), '// dışarıda\n');
      // 'junction': Windows'ta yönetici izni istemeyen klasör bağı (macOS/Linux'ta tür yok sayılır, sembolik bağ olur).
      symlinkSync(disari, join(o.kod, 'tests', 'scenarios', 'bag'), 'junction');
      for (const [yol, neden] of [
        ['../x.spec.ts', /geçersiz yol parçası/], ['scenarios/../../x.spec.ts', /geçersiz yol parçası/], ['scenarios/./x.spec.ts', /geçersiz yol parçası/],
        ['/etc/passwd', /mutlak yol/], ['canli/jet-kasko.spec.ts', /tests\/scenarios dışında/], ['scenarios', /tests\/scenarios dışında/],
        ['scenarios\\jet-satis\\x.spec.ts', /ters bölü/], ['scenarios/bag/x.spec.ts', /sembolik bağ/], ['', /geçersiz yol/]
      ] as const) {
        const r = kodYolunuDenetle(o.kod, yol);
        expect('neden' in r && r.neden, yol).toMatch(neden);
      }
      const iyi = kodYolunuDenetle(o.kod, SATIS_SPEC);
      expect(iyi).toEqual({ tam: join(o.kod, 'tests', SATIS_SPEC), goreli: SATIS_SPEC });
    } finally { o.temizle(); }
  });

  test('sonuçlar korunur, kod kalır → mezar taşı: senaryolar/modeller gider, geçmiş kalır, kod testleri hariç, uyarı yok, aktarım geri getirmez', async () => {
    const o = await kur();
    try {
      const satis = ekranBul(o, 'jet-satis');
      const ids = senaryolar(o, satis.id).map((s) => s.id);
      const medyaDosyasi = await sonucEkle(o, ids[0], 'kosu-1');
      const onizleme = ekranSilmeOnizlemesi(o.vt, o.projeId, satis.id, { kodKoku: o.kod });
      expect(onizleme.sayilar).toMatchObject({ modelSurumu: 0, senaryo: 2, sonuc: 1, sonucMedyasi: 1 });
      expect(onizleme.kod).toEqual({
        testVar: true, klasor: 'tests/scenarios/jet-satis',
        dosyalar: ['tests/scenarios/jet-satis/urun-ekranlari.spec.ts', 'tests/scenarios/jet-satis/yardimci.ts'], paylasilanlar: [], reddedilenler: []
      });
      expect(() => ekranSil(o.vt, o.projeId, satis.id, { onayAdi: 'Jet satış', kodKoku: o.kod, medyaKlasoru: o.medya })).toThrow(/adını aynen/);

      const r = ekranSil(o.vt, o.projeId, satis.id, { onayAdi: 'Jet Satış', kodKoku: o.kod, medyaKlasoru: o.medya });
      expect(r).toMatchObject({ tamamenSilindi: false, mezarTasi: true, korunanSonuc: 1, silinen: { senaryo: 2, sonuc: 0 }, kod: { kaldirilanlar: [], haricKalan: 1 } });
      // Kod diskte duruyor; sonuç ve şifreli medyası duruyor.
      expect(existsSync(join(o.kod, 'tests', SATIS_SPEC))).toBe(true);
      expect(existsSync(join(o.medya, medyaDosyasi))).toBe(true);
      expect(senaryolar(o, satis.id)).toEqual([]);
      // Senaryoların değişiklik geçmişi korunur.
      expect(o.vt.tumu("SELECT islem FROM degisiklik_gecmisi WHERE varlik_turu = 'senaryo' AND varlik_id = ? ORDER BY rowid", [ids[0]]).map((g) => g.islem)).toContain('sil');
      expect(gecmis(o, satis.id).at(-1)).toMatchObject({ islem: 'sil' });
      // Listelerden çıkar; silinmiş ekranlar bölümünde görünür; Sonuçlar "silinmiş ekran" der.
      expect(ekranlariListele(o.vt, o.projeId).some((e) => e.id === satis.id)).toBe(false);
      expect(ekranListesi(o.vt, o.projeId).silinmisEkranlar).toEqual([expect.objectContaining({ id: satis.id, sonucSayisi: 1, haricKodDosyasi: 1 })]);
      expect(sonucOzeti(o.vt, o.projeId).ekranlar.find((e) => e.anahtar === satis.id)?.ekranDurumu).toBe('silindi');
      // Koddaki testleri (yenileri dahil) koşulardan hariç.
      expect(haricMi(o, SATIS_SPEC, 'Ürün A ekranı açılmalı')).toBe(true);
      expect(haricMi(o, SATIS_SPEC, 'Sonradan eklenen')).toBe(true);
      // Yeniden aktarım (kaynak değişmiş olsa bile) silinen ekranın senaryolarını geri getirmez.
      const paket = JSON.parse(JSON.stringify(o.paket)) as { senaryolar: Array<{ anahtar: string; baslik: string; ekran: string | null; icerik: { kaynak: { ad: string } } }> };
      for (const s of paket.senaryolar.filter((x) => x.ekran === 'jet-satis')) { s.anahtar += ' (yeni)'; s.baslik += ' (yeni)'; s.icerik.kaynak.ad += ' (yeni)'; }
      aktarimiUygula(o.vt, paket as unknown as Parameters<typeof aktarimiUygula>[1]);
      expect(senaryolar(o, satis.id)).toEqual([]);
      expect(ekranBul(o, 'jet-satis').durum).toBe('silindi');

      // Temizle: sonuçlar + kod da → satır tamamen silinir; medya güvenle silinir; klasör kaldırılır.
      const o2 = ekranSilmeOnizlemesi(o.vt, o.projeId, satis.id, { kodKoku: o.kod });
      expect(o2.kod.dosyalar).toEqual(onizleme.kod.dosyalar);
      expect(() => ekranSil(o.vt, o.projeId, satis.id, {
        onayAdi: 'Jet Satış', sonuclariSil: true, koduKaldir: true, beklenenDosyalar: o2.kod.dosyalar.slice(1), kodKoku: o.kod, medyaKlasoru: o.medya
      })).toThrow(/değişti; hiçbir şey silinmedi/);
      expect(existsSync(join(o.kod, 'tests', SATIS_SPEC))).toBe(true);
      const t = ekranSil(o.vt, o.projeId, satis.id, {
        onayAdi: 'Jet Satış', sonuclariSil: true, koduKaldir: true, beklenenDosyalar: o2.kod.dosyalar, kodKoku: o.kod, medyaKlasoru: o.medya
      });
      expect(t).toMatchObject({ tamamenSilindi: true, silinen: { sonuc: 1, kosu: 1, medya: 1, medyaDosyasi: 1 }, kod: { kaldirilanlar: o2.kod.dosyalar, hatalar: [] } });
      expect(existsSync(join(o.kod, 'tests', 'scenarios', 'jet-satis'))).toBe(false);
      expect(existsSync(join(o.kod, 'tests', 'scenarios'))).toBe(true);
      expect(existsSync(join(o.medya, medyaDosyasi))).toBe(false);
      expect(o.vt.tek('SELECT COUNT(*) AS n FROM kosu_sonuclari')?.n).toBe(0);
      expect(o.vt.tek('SELECT id FROM ekranlar WHERE id = ?', [satis.id])).toBeUndefined();
      expect(ekranHaricKapsami(o.vt, o.projeId)).toEqual({ dosyalar: [], anahtarlar: [] });
    } finally { o.temizle(); }
  });

  test('kod kaldırılarak sil: yalnızca ekranın dosyaları; tests/scenarios dışı kaldırılmaz; "kodu kaldırılmış" uyarısı çıkmaz', async () => {
    const o = await kur();
    try {
      const kasko = ekranBul(o, 'jet-kasko');
      const oncekiDisari = readdirSync(join(o.kod, 'tests', 'canli'));
      const on = ekranSilmeOnizlemesi(o.vt, o.projeId, kasko.id, { kodKoku: o.kod });
      // Klasör tamamen JetKasko'nun: klasör kipi; canlı kontrolü (tests/canli) reddedilir.
      expect(on.kod.klasor).toBe('tests/scenarios/jet-kasko');
      expect(on.kod.dosyalar).toEqual(['tests/scenarios/jet-kasko/kod-testi.spec.ts', 'tests/scenarios/jet-kasko/yeni-kayit.spec.ts']);
      expect(on.kod.reddedilenler).toEqual([{ yol: 'tests/canli/jet-kasko.spec.ts', neden: 'tests/scenarios dışında' }]);
      const r = ekranSil(o.vt, o.projeId, kasko.id, { onayAdi: 'JetKasko', koduKaldir: true, beklenenDosyalar: on.kod.dosyalar, kodKoku: o.kod, medyaKlasoru: o.medya });
      expect(r.kod.kaldirilanlar).toEqual(on.kod.dosyalar);
      expect(readdirSync(join(o.kod, 'tests', 'canli'))).toEqual(oncekiDisari);
      expect(existsSync(join(o.kod, 'tests', SATIS_SPEC))).toBe(true);
      // Sonucu yok ama canlı kontrolünün kodu duruyor → mezar taşı (o dosya hariç tutulur).
      expect(r.tamamenSilindi).toBe(false);
      expect(ekranHaricKapsami(o.vt, o.projeId).dosyalar).toEqual(['canli/jet-kasko.spec.ts']);
      const denetim = kodKaldirilmisSenaryolar(o.vt, o.projeId, o.ortamId, { kodDosyasiVar: kodDosyasiVar(o), testListesi: LISTE.filter((t) => !t.dosya.includes('jet-kasko')) });
      expect(denetim.senaryolar.filter((s) => s.dosya?.includes('jet-kasko'))).toEqual([]);
      // Kalıntı satır (ör. yedekten gelen) kaldırılan dosyaya bağlı olsa da uyarı üretmez.
      senaryoKaydet(o.vt, { projeId: o.projeId, ekranId: null, baslik: 'Kalıntı', icerik: { kaynak: { dosya: KASKO_SPEC, ad: 'Kalıntı' }, ortamlar: { [o.ortamId]: {} } } });
      expect(kodKaldirilmisSenaryolar(o.vt, o.projeId, o.ortamId, { kodDosyasiVar: kodDosyasiVar(o) }).senaryolar.map((s) => s.baslik)).not.toContain('Kalıntı');
      // Kod kaldırma isteği ama kaldırılabilir dosya kalmadı.
      expect(() => ekranSil(o.vt, o.projeId, kasko.id, { onayAdi: 'JetKasko', koduKaldir: true, beklenenDosyalar: [], kodKoku: o.kod, medyaKlasoru: o.medya })).toThrow(/kaldırılabilecek test kodu yok/);
    } finally { o.temizle(); }
  });

  test('geri yükle: mezar taşı etkin (boş) ekran olur, hariç tutma kalkar; ad çakışırsa reddedilir', async () => {
    const o = await kur();
    try {
      const satis = ekranBul(o, 'jet-satis');
      ekranSil(o.vt, o.projeId, satis.id, { onayAdi: 'Jet Satış', kodKoku: o.kod, medyaKlasoru: o.medya });
      expect(() => ekranDurumunuAyarla(o.vt, o.projeId, satis.id, false)).toThrow(/bulunamadı/);
      expect(() => calistirmaIsteginiHazirla(o.vt, { projeId: o.projeId, ortamId: o.ortamId, senaryoId: 'yok', kosuId: 'k' })).toThrow();
      ekranYenidenAdlandir(o.vt, o.projeId, ekranBul(o, 'jet-dask').id, { ad: 'Jet Satış' });
      expect(() => ekranGeriYukle(o.vt, o.projeId, satis.id)).toThrow(/etkin bir ekran var/);
      ekranYenidenAdlandir(o.vt, o.projeId, ekranBul(o, 'jet-dask').id, { ad: 'JetDASK' });
      expect(ekranGeriYukle(o.vt, o.projeId, satis.id)).toEqual({ durum: 'etkin' });
      expect(ekranBul(o, 'jet-satis')).toMatchObject({ durum: 'etkin' });
      expect(ekranHaricKapsami(o.vt, o.projeId)).toEqual({ dosyalar: [], anahtarlar: [] });
      expect(gecmis(o, satis.id).map((g) => g.islem)).toEqual(['sil', 'guncelle']);
    } finally { o.temizle(); }
  });
});
