// KODLU SENARYOLARI AKIŞA TAŞIMA — JetKonut ve JetİlkAteşKonut taşıyıcıları (projeler/galaksi/tasima-konut.mjs): örnek eski
// dosyalar (SAHTE veri) aktarılır, "Ödeme (teklif kaydet + kredi kartı)" ortak akışı ve akış paketleri yüklenir; kodlu
// matristen (2 sigortalı × 3 ettiren × 2 durum) taslaklar önizlenir (senaryo kaydıyla aynı doğrulama), yazılır.
// Taşıyıcılar henüz AKIS_TASIYICILARI'nda olmadığı için adaptörün kancası burada sarılır. Şirket sitesine istek yoktur.
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ekranlariListele, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { aktarimiUygula } from '../../scripts/platform/aktarim/motor.mjs';
import { sayfaEkle } from '../../scripts/platform/ekranlar/ekran-servisi.mjs';
import { senaryoDetayi } from '../../scripts/platform/senaryolar/senaryo-servisi.mjs';
import { akisTasimaOnizle, akisTasimaUygula } from '../../scripts/platform/senaryolar/akis-tasima.mjs';
import { adaptorBul, type AktarimAdaptoru } from '../../projeler/index.mjs';
import { jetKonutAkisPaketi } from '../../projeler/galaksi/jetkonut-akis.mjs';
import { jetIlkAtesKonutAkisPaketi } from '../../projeler/galaksi/jetilkateskonut-akis.mjs';
import { teklifKaydetOdemeAkisPaketi } from '../../projeler/galaksi/odeme-akis.mjs';
import { jetIlkAtesKonutTasiyici, jetKonutTasiyici } from '../../projeler/galaksi/tasima-konut.mjs';
import { HIZLI_KDF, ORNEK_ESKI_DOSYALAR, SAHTE_ORTAM_DEGISKENLERI, geciciKlasor } from './platform-ortak';

const KOK = resolve(__dirname, '..', '..');
const PAROLA = 'Akis-Tasima-Konut-Kasa-Parolasi-7';

const TASIYICILAR: Record<string, typeof jetKonutTasiyici> = {
  'jet-konut-akis': jetKonutTasiyici,
  'jet-ilk-ates-konut-akis': jetIlkAtesKonutTasiyici
};

const BASLIKLAR = (['Özel', 'Tüzel'] as const).flatMap((t) =>
  (['Aynı', 'Farklı Özel', 'Farklı Tüzel'] as const).flatMap((e) =>
    (['Mal Sahibi', 'Kiracı'] as const).map((d) => `Sigortalı ${t} / Sigorta Ettiren ${e} / Sigortalı Durumu ${d} Testi`)));

type Ortam = { vt: Veritabani; projeId: string; ortamId: string; medya: string; adaptor: AktarimAdaptoru; temizle: () => void };

async function kur(): Promise<Ortam> {
  const k = geciciKlasor('akis-tasima-konut');
  const vt = await veritabaniniHazirla(join(k.yol, 'platform.db'));
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  const temel = adaptorBul('galaksi');
  if (!temel) throw new Error('galaksi adaptörü yok');
  const paket = await temel.paketOlustur(ORNEK_ESKI_DOSYALAR, { projeKoku: KOK, ortamDegiskenleri: { ...SAHTE_ORTAM_DEGISKENLERI }, testListesi: async () => [] });
  const { projeId } = aktarimiUygula(vt, paket);
  const ortamId = String(vt.tek("SELECT varlik_id FROM kaynak_eslemeleri WHERE varlik_turu = 'ortam' AND kaynak_anahtari = 'test'")?.varlik_id);
  const adaptor: AktarimAdaptoru = {
    ...temel,
    akisSenaryoTaslaklari: (v, p, o, e) => {
      const t = TASIYICILAR[e];
      if (!t) return null;
      const y = temel.yenidenKur(v, p, o);
      return y ? t(y) : null;
    }
  };
  const secenek = { senaryoIndeksleri: [], ortamIdleri: [], medyaKlasoru: join(k.yol, 'medya') };
  await sayfaEkle(vt, projeId, teklifKaydetOdemeAkisPaketi(), secenek);
  await sayfaEkle(vt, projeId, jetKonutAkisPaketi({ odeme: true }), secenek);
  await sayfaEkle(vt, projeId, jetIlkAtesKonutAkisPaketi({ odeme: true }), secenek);
  return { vt, projeId, ortamId, medya: join(k.yol, 'medya'), adaptor, temizle: () => { vt.kapat(); k.temizle(); } };
}

function ekranId(o: Ortam, anahtar: string): string {
  const e = ekranlariListele(o.vt, o.projeId).find((x) => x.anahtar === anahtar);
  if (!e) throw new Error(`${anahtar} yok`);
  return String(e.id);
}

test('JetKonut: kodlu matris (2 × 3 × 2) önizlenir, doğrulamadan geçer, yazılır', async () => {
  const o = await kur();
  try {
    const id = ekranId(o, 'jet-konut-akis');
    const on = akisTasimaOnizle(o.vt, o.projeId, id, o.ortamId, o.adaptor);
    expect(on.kaynakEkran).toBe('JetKonut');
    expect(on.taslaklar.map((x) => x.baslik)).toEqual(BASLIKLAR);
    expect(on.taslaklar.map((x) => [x.baslik, x.durum, x.hatalar])).toEqual(on.taslaklar.map((x) => [x.baslik, 'yeni', []]));

    // Özel / aynı / mal sahibi: mal sahibi alanları var, ettiren alanları yok.
    const ilk = on.taslaklar[0].veri;
    expect(ilk).toMatchObject({
      sigortaliTipi: 'ozel', sigortaliProfili: 'tc1', sigortaliTelefonKodu: '555', sigortaliTelefonNo: '0000001', sigortaEttiren: 'ayni',
      sigortaliDurumu: 'malSahibi', adresKodu: '1000000002', binaTipi: 'APARTMAN DAİRESİ', brutYuzolcum: '100', daskaBagli: 'hayir',
      dainiMurtehin: 'yok', alternatifPlus: 'E', alternatif: '1', yapiTarzi: 'TAM KAGİR', toplamKat: '1-4 ARASI', rizikonunBulunduguKat: '1.KAT',
      catiTipi: 'AHŞAP ÜSTÜ KİREMİT', altmisGundenFazlaBos: 'hayir', binaInsaYili: '2025', binaYangin: '3000000', esyaYangin: '1000000',
      dahiliDekorasyonYangin: '100000', camKirilmasi: '1000', esyaDeprem: true, hirsizlik: true, ferdiKazaTekLimit: '10.000 TL',
      hukuksalKoruma: '2.500 TL', enflasyonOrani: '%30', odemeAdimiDahil: true
    });
    expect(ilk).not.toHaveProperty('ettirenProfili');
    // Tüzel / farklı tüzel / kiracı: mal sahibi alanları yok, ettiren tüzel profil ve telefonuyla.
    const son = on.taslaklar[11].veri;
    expect(son).toMatchObject({
      sigortaliTipi: 'tuzel', sigortaliProfili: 'vkn1', sigortaliTelefonKodu: '555', sigortaliTelefonNo: '0000005',
      sigortaEttiren: 'farkli', ettirenTipi: 'tuzel', ettirenProfili: 'vkn2', ettirenTelefonKodu: '555', ettirenTelefonNo: '0000006',
      sigortaliDurumu: 'kiraci'
    });
    expect(son).not.toHaveProperty('brutYuzolcum');
    expect(son).not.toHaveProperty('binaYangin');
    expect(on.taslaklar[3].veri).toMatchObject({ ettirenTipi: 'ozel', ettirenProfili: 'tc2', ettirenTelefonNo: '0000002' });
    // Kodlu testin kabul ettiği ödeme sonucu ortak akışın başarı mesajlarında (içerir eşleşmesi): not çıkmaz.
    expect(on.notlar.join(' ')).not.toContain('Kodlu testin kabul ettiği ödeme sonucu');
    expect(on.notlar.join(' ')).toContain('görünen metinle');
    expect(o.vt.tek('SELECT COUNT(*) AS n FROM senaryolar WHERE ekran_id = ?', [id])?.n).toBe(0);

    expect(akisTasimaUygula(o.vt, o.projeId, id, o.ortamId, o.adaptor, BASLIKLAR)).toEqual({ eklenen: 12, atlanan: 0 });
    const kayit = o.vt.tek('SELECT id FROM senaryolar WHERE ekran_id = ? AND baslik = ?', [id, BASLIKLAR[11]]);
    const d = senaryoDetayi(o.vt, String(kayit?.id), o.ortamId);
    expect(d).toMatchObject({ kosuyaDahil: false, ortamlar: [o.ortamId] });
    expect(d.veri).toMatchObject({ sigortaliProfili: 'vkn1', ettirenProfili: 'vkn2', sigortaliDurumu: 'kiraci', catiTipi: 'AHŞAP ÜSTÜ KİREMİT' });
    expect(akisTasimaOnizle(o.vt, o.projeId, id, o.ortamId, o.adaptor).taslaklar.every((x) => x.durum === 'var')).toBe(true);
  } finally {
    o.temizle();
  }
});

test('JetİlkAteşKonut: kodlu matris (2 × 3 × 2) önizlenir, doğrulamadan geçer, yazılır', async () => {
  const o = await kur();
  try {
    const id = ekranId(o, 'jet-ilk-ates-konut-akis');
    const on = akisTasimaOnizle(o.vt, o.projeId, id, o.ortamId, o.adaptor);
    expect(on.kaynakEkran).toBe('JetİlkAteşKonut');
    expect(on.taslaklar.map((x) => x.baslik)).toEqual(BASLIKLAR);
    expect(on.taslaklar.map((x) => [x.baslik, x.durum, x.hatalar])).toEqual(on.taslaklar.map((x) => [x.baslik, 'yeni', []]));
    expect(on.taslaklar[1].veri).toEqual({
      sigortaliTipi: 'ozel', sigortaliTelefonKodu: '555', sigortaliTelefonNo: '0000001', sigortaliProfili: 'tc1', sigortaEttiren: 'ayni',
      sigortaliDurumu: 'kiraci', adresKodu: '1000000002', alternatif: '1', yapiTarzi: 'TAM KAGİR', binaInsaYili: '2025', odemeAdimiDahil: true
    });
    expect(on.taslaklar[4].veri).toMatchObject({ sigortaEttiren: 'farkli', ettirenTipi: 'tuzel', ettirenProfili: 'vkn2', ettirenTelefonNo: '0000006' });
    expect(on.notlar.join(' ')).toContain('eşya yangın 30000');
    // Kodlu testin kabul ettiği ödeme sonucu ortak akışın başarı mesajlarında (içerir eşleşmesi): not çıkmaz.
    expect(on.notlar.join(' ')).not.toContain('Kodlu testin kabul ettiği ödeme sonucu');

    expect(akisTasimaUygula(o.vt, o.projeId, id, o.ortamId, o.adaptor, BASLIKLAR.slice(0, 6))).toEqual({ eklenen: 6, atlanan: 0 });
    // Profilden türetilen telefonlar (modelde hassas) senaryo kaydında düz metin durmaz (kasa zarfı).
    const telefonAlanlari = o.vt.tumu('SELECT icerik_json FROM senaryolar WHERE ekran_id = ?', [id]).flatMap((s) => {
      const icerik = JSON.parse(String(s.icerik_json)) as { ortamlar: Record<string, { veri?: Record<string, unknown> }> };
      return Object.values(icerik.ortamlar).flatMap((x) => Object.entries(x.veri ?? {}).filter(([k]) => /TelefonNo$|TelefonKodu$/.test(k)).map(([, v]) => String(v)));
    });
    expect(telefonAlanlari.length).toBeGreaterThan(0);
    for (const v of telefonAlanlari) expect(v).toMatch(/^kasa:/);
    expect(o.vt.tumu('SELECT id FROM senaryolar WHERE ekran_id = ?', [id])).toHaveLength(6);
    const tekrar = akisTasimaOnizle(o.vt, o.projeId, id, o.ortamId, o.adaptor);
    expect(tekrar.taslaklar.map((x) => x.durum)).toEqual([...Array(6).fill('var'), ...Array(6).fill('yeni')]);
  } finally {
    o.temizle();
  }
});
