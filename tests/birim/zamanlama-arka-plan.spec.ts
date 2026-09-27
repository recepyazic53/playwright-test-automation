// KORUMA TESTLERİ — Zamanlanmış koşuların kasa kilitliyken / açılışta çalışma tercihleri (Ayarlar > Koşu; üçü de varsayılan KAPALI):
//   A) anahtar yalnız bellekte (anahtar-emaneti.mjs): arayüz kilidi, veri uçları 423, zamanlayıcı SAHTE koşucuyla çalışır,
//      "Tamamen kilitle" anahtarı siler.
//   B) Windows DPAPI (dpapi.mjs): GERÇEK gidiş-dönüş yalnız Windows'ta (geçici dosya, sahte anahtar; kullanıcının kasasına dokunulmaz),
//      dosya yedeğe girmez, parola değişince geçersizleşir / yenilenir. Akış testleri SAHTE DPAPI yürütücüsüyle.
//   C) Windows Görev Zamanlayıcı (oturum-gorevi.mjs): komut dizileri saf fonksiyonlardan; yürütücü SAHTE — schtasks HİÇ çalıştırılmaz.
// Gerçek koşu, tarayıcı, dış istek YOK; çalışan Nöbetçi'ye ve veri/ klasörüne dokunulmaz (uçtan uca test ayrı, geçici sunucu).
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import {
  KasaHatasi, acikAnahtar, arayuzAcikMi, arkaPlanKipindeMi, kasaAc, kasaAcikMi, kasaDurumu, kasaKdfOku, kasaKilitle, kasaOlustur, parolaDegistir
} from '../../scripts/platform/kasa.mjs';
import { ayarGetir, ayarYaz, ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { yedekAc, yedekDosyasiYaz } from '../../scripts/platform/yedek.mjs';
import { kuralKaydet } from '../../scripts/platform/zamanlama/kurallar.mjs';
import { zamanlayiciOlustur, type YurutmeSonucu } from '../../scripts/platform/zamanlama/zamanlayici.mjs';
import {
  arayuzKilidindeIzinliMi, arkaPlanIsiBaslat, emanetVarMi, emanetiSil
} from '../../scripts/platform/zamanlama/anahtar-emaneti.mjs';
import {
  dosyayiGuvenliSil, dpapiCoz, dpapiDosyaBilgisi, dpapiDosyaYolu, dpapiDosyasiOku, dpapiDosyasiYaz, dpapiKomutu, dpapiKoru, type DpapiYurutucu
} from '../../scripts/platform/zamanlama/dpapi.mjs';
import {
  GOREV_ADI, gorevHedefi, gorevKomutlari, gorevOlustur, gorevSil, gorevXml, gorevXmlBaytlari, komutSatiriArgumani, type GorevYurutucu
} from '../../scripts/platform/zamanlama/oturum-gorevi.mjs';
import { TERCIH_AYAR_ANAHTARI, arkaPlanYoneticisi } from '../../scripts/platform/zamanlama/arka-plan.mjs';
import { siraOlustur } from '../../scripts/platform/kasa-sirasi.mjs';
import { UYGULAMA_GIRDILERI } from '../../scripts/paket/paket-ortak.mjs';
import { nobetciApi, nobetciBaslat } from './nobetci-sunucusu';
import { HIZLI_KDF, geciciKlasor, loglariYakala, izinleriAc } from './platform-ortak';

const PAROLA = 'Arka-Plan-Kasa-2026';
const YENI_PAROLA = 'Arka-Plan-Kasa-Yeni-2027';
const KOK = resolve(__dirname, '..', '..');

/** Sahte deneme sınırı: fonksiyonu doğrudan çalıştırır. */
const denemeSiniri = { dene: <T>(fn: () => Promise<T>) => fn() };

/**
 * SAHTE DPAPI: gerçek şifreleme değil — "koru" veriyi entropiyle XOR'layıp önüne sabit ek koyar; "coz" tersini yapar, entropi
 * uymazsa hata verir. Çağrıları kaydeder (argümanlarda gizli değer olmadığını doğrulamak için).
 */
function sahteDpapi() {
  const cagrilar: Array<{ komut: string; argumanlar: string[]; stdin: string }> = [];
  const yurutucu: DpapiYurutucu = async (komut, argumanlar, stdin) => {
    cagrilar.push({ komut, argumanlar, stdin });
    const [islem, entropiB64, veriB64] = stdin.trim().split('\n');
    const entropi = Buffer.from(entropiB64, 'base64');
    const veri = Buffer.from(veriB64, 'base64');
    const xor = (b: Buffer) => Buffer.from(b.map((x, i) => x ^ entropi[i % entropi.length] ^ 0x5a));
    if (islem === 'koru') return Buffer.concat([Buffer.from('SAHTE'), entropi.subarray(-4), xor(veri)]).toString('base64');
    if (!veri.subarray(0, 5).equals(Buffer.from('SAHTE')) || !veri.subarray(5, 9).equals(entropi.subarray(-4))) throw new Error('Windows DPAPI işlemi başarısız.');
    return xor(veri.subarray(9)).toString('base64');
  };
  return { yurutucu, cagrilar };
}

/** SAHTE schtasks: görev "kaydı" bellekte; çağrılar kaydedilir. Gerçek schtasks ÇALIŞTIRILMAZ. */
function sahteSchtasks(secenek: { olusturmaKodu?: number } = {}) {
  const cagrilar: Array<{ komut: string; argumanlar: string[]; xml?: string }> = [];
  let kayitli = false;
  const yurutucu: GorevYurutucu = async (komut, argumanlar) => {
    const c: { komut: string; argumanlar: string[]; xml?: string } = { komut, argumanlar };
    cagrilar.push(c);
    if (argumanlar[0] === '/Create') {
      const yol = argumanlar[argumanlar.indexOf('/XML') + 1];
      c.xml = readFileSync(yol).subarray(2).toString('utf16le');
      if (secenek.olusturmaKodu) return { kod: secenek.olusturmaKodu, cikti: 'HATA' };
      kayitli = true;
      return { kod: 0, cikti: 'BAŞARILI' };
    }
    if (argumanlar[0] === '/Query') return kayitli ? { kod: 0, cikti: GOREV_ADI } : { kod: 1, cikti: 'HATA: yok' };
    if (argumanlar[0] === '/Delete') { kayitli = false; return { kod: 0, cikti: 'BAŞARILI' }; }
    return { kod: 99, cikti: '' };
  };
  return { yurutucu, cagrilar, kayitliMi: () => kayitli };
}

async function hazirVeritabani(klasor: string): Promise<{ vt: Veritabani; projeId: string; ortamId: string }> {
  const vt = await veritabaniniHazirla(join(klasor, 'platform.db'));
  await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
  // İzinlerden bağımsız davranış sınanıyor: Ayarlar > İzinler (varsayılan kapalı) açılır.
  izinleriAc(vt);
  const projeId = projeKaydet(vt, { ad: 'Örnek proje' });
  const ortamId = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: 'https://test.ornek.invalid', varsayilan: true, ayarlar: { riskli: false } });
  return { vt, projeId, ortamId };
}

// ---------------------------------------------------------------------------------------------------------------------
// A) Anahtar yalnız bellekte
// ---------------------------------------------------------------------------------------------------------------------

test('A: tercih kapalıyken kilitleme bugünkü gibi; açıkken arayüz kilitli, anahtar yalnız emanette; "Tamamen kilitle" siler', async () => {
  const klasor = geciciKlasor('arka-plan-a');
  const log = loglariYakala();
  const { vt } = await hazirVeritabani(klasor.yol);
  const yonetici = arkaPlanYoneticisi({ veritabaniYolu: () => join(klasor.yol, 'platform.db'), projeKoku: KOK, denemeSiniri, platform: 'linux', log: () => {} });
  try {
    // Varsayılan: üçü de kapalı; kilitleme = kasaKilitle (bugünkü davranış), emanet yok.
    expect(yonetici.tercihleriOku(vt)).toEqual({ kilitliyken: false, dpapi: false, oturumAcilisi: false });
    expect(yonetici.kilitSecimiVarMi(vt)).toBe(false);
    expect(yonetici.kilitle(vt)).toEqual({ arkaPlan: false });
    expect(kasaAcikMi(vt)).toBe(false);
    expect(emanetVarMi(vt)).toBe(false);
    expect(arkaPlanIsiBaslat(vt)).toBeNull();

    await kasaAc(vt, PAROLA);
    await yonetici.tercihDegistir(vt, { ad: 'kilitliyken', acik: true, onay: true });
    // Tercih kasada ŞİFRELİ ayar.
    expect(String(vt.tek('SELECT deger_json FROM ayarlar WHERE anahtar = ?', [TERCIH_AYAR_ANAHTARI])?.deger_json)).toMatch(/^kasa:v1:/);
    expect(yonetici.kilitSecimiVarMi(vt)).toBe(true);

    // "Kilitle (zamanlanmış koşular sürsün)": arayüz kilitli, anahtar kasada YOK (yalnız emanette).
    expect(yonetici.kilitle(vt)).toEqual({ arkaPlan: true });
    expect(kasaDurumu(vt).acik).toBe(false);
    expect(kasaAcikMi(vt)).toBe(false);
    expect(emanetVarMi(vt)).toBe(true);
    expect(yonetici.kilitDurumu(vt)).toMatchObject({ anahtarBellekte: true, kilitSecimi: false });
    expect(() => ayarGetir(vt, TERCIH_AYAR_ANAHTARI)).toThrow(KasaHatasi);

    // Arka plan işi: anahtar arka plan kipinde (koşucu için açık, arayüz için KİLİTLİ); bitince kasadan silinir.
    const bitir = arkaPlanIsiBaslat(vt);
    expect(bitir).not.toBeNull();
    expect(kasaAcikMi(vt)).toBe(true);
    expect(arayuzAcikMi(vt)).toBe(false);
    expect(arkaPlanKipindeMi(vt)).toBe(true);
    expect(kasaDurumu(vt).acik).toBe(false);
    bitir?.();
    bitir?.(); // ikinci çağrı etkisiz
    expect(kasaAcikMi(vt)).toBe(false);
    expect(emanetVarMi(vt)).toBe(true);

    // Arka plan sırasında kullanıcı parolayla açarsa arayüz kilidi kalkar; iş bitince kasa AÇIK kalır.
    const bitir2 = arkaPlanIsiBaslat(vt);
    await kasaAc(vt, PAROLA);
    expect(arayuzAcikMi(vt)).toBe(true);
    bitir2?.();
    expect(arayuzAcikMi(vt)).toBe(true);

    // "Tamamen kilitle": emanet de silinir; zamanlayıcı artık anahtar bulamaz.
    expect(yonetici.kilitle(vt, { tamamen: true })).toEqual({ arkaPlan: false });
    expect(emanetVarMi(vt)).toBe(false);
    expect(kasaAcikMi(vt)).toBe(false);
    expect(arkaPlanIsiBaslat(vt)).toBeNull();

    // Tercihi kapatmak emaneti siler.
    await kasaAc(vt, PAROLA);
    yonetici.kilitle(vt);
    expect(emanetVarMi(vt)).toBe(true);
    await kasaAc(vt, PAROLA);
    await yonetici.tercihDegistir(vt, { ad: 'kilitliyken', acik: false });
    expect(emanetVarMi(vt)).toBe(false);
    expect(yonetici.kilitle(vt)).toEqual({ arkaPlan: false });

    // Emanetteki anahtar kasaya artık uymuyorsa (parola başka yoldan değişti) kullanılmaz ve silinir.
    await kasaAc(vt, PAROLA);
    await yonetici.tercihDegistir(vt, { ad: 'kilitliyken', acik: true, onay: true });
    yonetici.kilitle(vt);
    await kasaAc(vt, PAROLA);
    await parolaDegistir(vt, PAROLA, YENI_PAROLA, { kdf: HIZLI_KDF });
    kasaKilitle(vt); // emanet eski anahtarla kaldı
    expect(emanetVarMi(vt)).toBe(true);
    expect(arkaPlanIsiBaslat(vt)).toBeNull();
    expect(emanetVarMi(vt)).toBe(false);
    log.gizliYokMu([PAROLA, YENI_PAROLA]);
  } finally {
    log.birak();
    emanetiSil(vt);
    vt.kapat();
    klasor.temizle();
  }
});

test('A: arayüz kilidinde yalnız durum / kasa aç-kilitle / çalışma alanı / raporlayıcı uçları geçer (varsayılan reddet)', () => {
  for (const [y, yol] of [['GET', '/platform/durum'], ['GET', '/platform/calisma-alanlari'], ['POST', '/platform/kasa/ac'], ['POST', '/platform/kasa/kilitle'],
    ['POST', '/platform/calisma-alani/ac'], ['POST', '/platform/calisma-alani/kapat'], ['POST', '/platform/sonuc/kaydet'], ['POST', '/platform/sonuc/bitir'],
    ['POST', '/platform/sonuc/medya-anahtari']]) {
    expect(arayuzKilidindeIzinliMi(y, yol), `${y} ${yol}`).toBe(true);
  }
  for (const [y, yol] of [['GET', '/platform/projeler'], ['GET', '/platform/ortamlar'], ['GET', '/platform/medya/abc'], ['GET', '/platform/sonuclar/ozet'],
    ['GET', '/platform/zamanlanmis-kosular'], ['GET', '/platform/zamanlama/tercihler'], ['GET', '/platform/sonuclar/html-rapor'], ['POST', '/platform/senaryolar/calistir'],
    ['POST', '/platform/kasa/parola-degistir'], ['POST', '/platform/yedek/disa-aktar'], ['POST', '/platform/zamanlama/tercih'], ['POST', '/platform/giris-profili/goster'],
    ['GET', '/platform/kasa/ac'], ['DELETE', '/platform/durum'], ['POST', '/platform/calisma-alani/kaldir'], ['POST', '/platform/sonuc/baska']]) {
    expect(arayuzKilidindeIzinliMi(y, yol), `${y} ${yol}`).toBe(false);
  }
});

test('A: kasa kilitliyken zamanlayıcı emanetteki anahtarla SAHTE koşucuyu çalıştırır; koşu sırasında arayüz kilitli kalır', async () => {
  const klasor = geciciKlasor('arka-plan-a-zaman');
  const { vt, projeId, ortamId } = await hazirVeritabani(klasor.yol);
  const yonetici = arkaPlanYoneticisi({ veritabaniYolu: () => join(klasor.yol, 'platform.db'), projeKoku: KOK, denemeSiniri, platform: 'linux', log: () => {} });
  try {
    const an = (saat: number, dakika = 0) => new Date(2026, 8, 28, saat, dakika);
    kuralKaydet(vt, projeId, { ad: 'Sabah koşusu', ortamId, kapsam: { senaryolar: 'tum' }, zaman: { tur: 'gunluk', saat: '09:00' } }, { simdi: an(8) });
    await yonetici.tercihDegistir(vt, { ad: 'kilitliyken', acik: true, onay: true });
    yonetici.kilitle(vt);
    expect(kasaAcikMi(vt)).toBe(false);

    const gozlemler: Array<{ kasaAcik: boolean; arayuzAcik: boolean; durumAcik: boolean }> = [];
    let saat = an(9, 0);
    const z = zamanlayiciOlustur({
      veritabani: () => (kasaAcikMi(vt) ? vt : null),
      arkaPlanIsi: () => arkaPlanIsiBaslat(vt),
      mesgulMu: () => false,
      simdi: () => saat,
      // SAHTE koşucu: gerçek koşu başlatmaz; koşu sırasındaki kasa/arayüz durumunu kaydeder.
      yurut: async (): Promise<YurutmeSonucu> => {
        gozlemler.push({ kasaAcik: kasaAcikMi(vt), arayuzAcik: arayuzAcikMi(vt), durumAcik: kasaDurumu(vt).acik });
        return { durum: 'tamamlandi', mesaj: '1 başarılı, 0 başarısız', kosuId: 'zamanli-sahte', ozet: { toplam: 1, basarili: 1, basarisiz: 0, atlanan: 0, hata: 0 }, akisKosulari: [] };
      }
    });
    const baslayan = await z.kontrolEt();
    expect(baslayan).toHaveLength(1);
    await Promise.all(baslayan);
    await new Promise((c) => setTimeout(c, 10)); // bitir() Promise.allSettled sonrası
    expect(gozlemler).toEqual([{ kasaAcik: true, arayuzAcik: false, durumAcik: false }]);
    // Koşu bitti: anahtar kasadan silindi, emanette duruyor.
    expect(kasaAcikMi(vt)).toBe(false);
    expect(emanetVarMi(vt)).toBe(true);

    // Vakti gelmemişken denetim anahtarı açıp kapatır (koşu yok).
    saat = an(9, 30);
    expect(await z.kontrolEt()).toHaveLength(0);
    expect(kasaAcikMi(vt)).toBe(false);

    // "Tamamen kilitle" sonrası zamanlayıcı hiçbir şey yapmaz.
    yonetici.kilitle(vt, { tamamen: true });
    saat = new Date(2026, 8, 29, 9, 0);
    expect(await z.kontrolEt()).toHaveLength(0);
    expect(gozlemler).toHaveLength(1);
  } finally {
    emanetiSil(vt);
    vt.kapat();
    klasor.temizle();
  }
});

test('A (uçtan uca, geçici sunucu): kilitleme seçimi, arayüz kilidinde veri uçları 423, "Tamamen kilitle"', async () => {
  test.setTimeout(90_000);
  const klasor = geciciKlasor('arka-plan-sunucu');
  const vtYolu = join(klasor.yol, 'platform.db');
  // Tercih doğrudan kasaya yazılır (Ayarlar uçları Windows'ta schtasks /Query çağırdığı için burada kullanılmaz).
  const hazir = await veritabaniniHazirla(vtYolu);
  await kasaOlustur(hazir, PAROLA, { kdf: HIZLI_KDF });
  // İzinlerden bağımsız davranış sınanıyor: Ayarlar > İzinler (varsayılan kapalı) açılır.
  izinleriAc(hazir);
  projeKaydet(hazir, { ad: 'Örnek proje' });
  hazir.kapat();
  const n = await nobetciBaslat(klasor.yol, vtYolu);
  try {
    expect((await nobetciApi(n, '/platform/kasa/ac', { parola: PAROLA })).basarili).toBe(true);
    // Tercih kapalı: tek seçenek, bugünkü gibi tamamen kilitler.
    let d = await nobetciApi(n, '/platform/durum');
    expect(d.zamanlama).toEqual({ anahtarBellekte: false, dpapiDosyasi: false, kilitSecimi: false });
    let k = await nobetciApi(n, '/platform/kasa/kilitle', {});
    expect(k).toMatchObject({ basarili: true, arkaPlan: false, kasa: { acik: false } });
    expect((await nobetciApi(n, '/platform/projeler')).kod).toBe('KASA_KILITLI');
    expect((await nobetciApi(n, '/platform/kasa/ac', { parola: PAROLA })).basarili).toBe(true);
    expect((await nobetciApi(n, '/platform/projeler')).basarili).toBe(true);
  } finally {
    n.surec.kill();
    await new Promise((c) => n.surec.once('exit', c));
  }

  // Tercih açık: sunucu kapalıyken kasaya yazılır (aynı veritabanına iki süreç yazmasın), sonra yeni sunucu başlatılır.
  const vt2 = await veritabaniniHazirla(vtYolu);
  await kasaAc(vt2, PAROLA);
  ayarYaz(vt2, TERCIH_AYAR_ANAHTARI, { kilitliyken: true, dpapi: false, oturumAcilisi: false });
  kasaKilitle(vt2);
  vt2.kapat();
  const n2 = await nobetciBaslat(klasor.yol, vtYolu);
  try {
    expect((await nobetciApi(n2, '/platform/kasa/ac', { parola: PAROLA })).basarili).toBe(true);
    let d = await nobetciApi(n2, '/platform/durum');
    expect(d.zamanlama).toMatchObject({ kilitSecimi: true, anahtarBellekte: false });
    // "Kilitle (zamanlanmış koşular sürsün)": arayüz kilitli, anahtar zamanlayıcı için bellekte.
    const k = await nobetciApi(n2, '/platform/kasa/kilitle', {});
    expect(k).toMatchObject({ basarili: true, arkaPlan: true, kasa: { acik: false } });
    d = await nobetciApi(n2, '/platform/durum');
    expect(d).toMatchObject({ kasa: { acik: false }, zamanlama: { anahtarBellekte: true, kilitSecimi: false } });
    for (const yol of ['/platform/projeler', '/platform/zamanlama/tercihler', '/platform/zamanlanmis-kosular?projeId=x', '/platform/sonuclar/ozet?projeId=x']) {
      const r = await nobetciApi(n2, yol);
      expect(r, yol).toMatchObject({ basarili: false, kod: 'KASA_KILITLI' });
    }
    expect((await nobetciApi(n2, '/platform/zamanlama/tercih', { ad: 'kilitliyken', acik: false })).kod).toBe('KASA_KILITLI');
    // Arayüzden açmak yine parola ister.
    expect((await nobetciApi(n2, '/platform/kasa/ac', { parola: 'yanlis-parola-1' })).kod).toBe('PAROLA_YANLIS');
    // "Tamamen kilitle": anahtar bellekten de silinir.
    expect(await nobetciApi(n2, '/platform/kasa/kilitle', { tamamen: true })).toMatchObject({ basarili: true, arkaPlan: false });
    d = await nobetciApi(n2, '/platform/durum');
    expect(d.zamanlama).toMatchObject({ anahtarBellekte: false });
  } finally {
    n2.surec.kill();
    await new Promise((c) => n2.surec.once('exit', c));
    klasor.temizle();
  }
});

test('A: "Tamamen kilitle" süren arka plan işini beklemez — anahtar hemen silinir, surenIs döner; iş bitince anahtar geri gelmez', async () => {
  const klasor = geciciKlasor('arka-plan-tamamen');
  const { vt } = await hazirVeritabani(klasor.yol);
  const yonetici = arkaPlanYoneticisi({ veritabaniYolu: () => join(klasor.yol, 'platform.db'), projeKoku: KOK, denemeSiniri, platform: 'linux', log: () => {} });
  try {
    await yonetici.tercihDegistir(vt, { ad: 'kilitliyken', acik: true, onay: true });
    // 1) Arka plan kipinde (arayüz kilitli, zamanlayıcının işi anahtarı kasaya yerleştirmiş) iş sürerken "Tamamen kilitle".
    expect(yonetici.kilitle(vt)).toEqual({ arkaPlan: true });
    const bitir = arkaPlanIsiBaslat(vt);
    expect(bitir).not.toBeNull();
    expect(arkaPlanKipindeMi(vt)).toBe(true);
    expect(yonetici.kilitle(vt, { tamamen: true })).toEqual({ arkaPlan: false, surenIs: true });
    expect(emanetVarMi(vt)).toBe(false);
    expect(kasaAcikMi(vt)).toBe(false);
    expect(yonetici.kilitDurumu(vt).anahtarBellekte).toBe(false);
    // Süren işin bitişi anahtarı geri getirmez; yeni iş anahtar bulamaz.
    bitir?.();
    expect(kasaAcikMi(vt)).toBe(false);
    expect(emanetVarMi(vt)).toBe(false);
    expect(arkaPlanIsiBaslat(vt)).toBeNull();
    expect(yonetici.kilitDurumu(vt).anahtarBellekte).toBe(false);

    // 2) Kasa kullanıcı tarafından açıkken iş sürüyor (emanet de var): "Tamamen kilitle" yine hemen siler.
    await kasaAc(vt, PAROLA);
    expect(yonetici.kilitle(vt)).toEqual({ arkaPlan: true });
    await kasaAc(vt, PAROLA);
    const bitir2 = arkaPlanIsiBaslat(vt);
    expect(bitir2).not.toBeNull();
    expect(emanetVarMi(vt)).toBe(true);
    expect(yonetici.kilitle(vt, { tamamen: true })).toEqual({ arkaPlan: false, surenIs: true });
    expect(kasaAcikMi(vt)).toBe(false);
    expect(emanetVarMi(vt)).toBe(false);
    bitir2?.();
    expect(yonetici.kilitDurumu(vt).anahtarBellekte).toBe(false);

    // 3) Süren iş yokken surenIs alanı hiç gelmez.
    await kasaAc(vt, PAROLA);
    expect(yonetici.kilitle(vt, { tamamen: true })).toEqual({ arkaPlan: false });
  } finally {
    emanetiSil(vt);
    vt.kapat();
    klasor.temizle();
  }
});

test('B: açılışta DPAPI çözülürken "Tamamen kilitle" gelirse (yarış) anahtar emanete konmaz', async () => {
  const klasor = geciciKlasor('dpapi-yaris');
  const { vt } = await hazirVeritabani(klasor.yol);
  const vtYolu = join(klasor.yol, 'platform.db');
  const dpapi = sahteDpapi();
  // Çözme çağrısı (stdin "coz" ile başlar) kapı açılana kadar bekletilir: kilitleme tam bu arada gelir.
  let kapiyiAc: () => void = () => {};
  let bekletilsin = false;
  let cozmeBekliyor = false;
  const yavasDpapi: DpapiYurutucu = async (komut, argumanlar, stdin) => {
    if (bekletilsin && stdin.startsWith('coz')) await new Promise<void>((c) => { kapiyiAc = c; cozmeBekliyor = true; });
    return dpapi.yurutucu(komut, argumanlar, stdin);
  };
  const yonetici = arkaPlanYoneticisi({
    veritabaniYolu: () => vtYolu, projeKoku: KOK, denemeSiniri, platform: 'win32', dpapiYurutucu: yavasDpapi, gorevYurutucu: sahteSchtasks().yurutucu, log: () => {}
  });
  try {
    await yonetici.tercihDegistir(vt, { ad: 'dpapi', acik: true, parola: PAROLA, onay: true });
    yonetici.kilitle(vt, { tamamen: true });
    // Kontrol: yarış yokken açılış yüklemesi anahtarı emanete koyar.
    expect(await yonetici.acilistaYukle(vt)).toBe(true);
    expect(emanetVarMi(vt)).toBe(true);
    emanetiSil(vt);

    bekletilsin = true;
    const yukleme = yonetici.acilistaYukle(vt);
    await expect.poll(() => cozmeBekliyor).toBe(true);
    // Kullanıcı kasayı açıp "Tamamen kilitle" diyor; ardından DPAPI çözmesi biter.
    await kasaAc(vt, PAROLA);
    expect(yonetici.kilitle(vt, { tamamen: true })).toEqual({ arkaPlan: false });
    kapiyiAc();
    expect(await yukleme).toBe(false);
    expect(emanetVarMi(vt)).toBe(false);
    expect(kasaAcikMi(vt)).toBe(false);
    expect(yonetici.kilitDurumu(vt).anahtarBellekte).toBe(false);
  } finally {
    emanetiSil(vt);
    vt.kapat();
    klasor.temizle();
  }
});

test('A: kasa sırası (yarış) — süren açma / parola değiştirme sonrası gelen "Tamamen kilitle" kazanır; sırasız hâlde anahtar geri gelir', async () => {
  const klasor = geciciKlasor('kasa-sirasi');
  const { vt } = await hazirVeritabani(klasor.yol);
  const yonetici = arkaPlanYoneticisi({ veritabaniYolu: () => join(klasor.yol, 'platform.db'), projeKoku: KOK, denemeSiniri, platform: 'linux', log: () => {} });
  try {
    await yonetici.tercihDegistir(vt, { ad: 'kilitliyken', acik: true, onay: true });
    yonetici.kilitle(vt, { tamamen: true });
    // Sırasız (düzeltme öncesi davranış): açma KDF'yi beklerken kilitleme biter, sonra açma anahtarı yerleştirir → kasa AÇIK kalır.
    const sirasizAc = kasaAc(vt, PAROLA);
    yonetici.kilitle(vt, { tamamen: true });
    await sirasizAc;
    expect(kasaAcikMi(vt)).toBe(true);
    yonetici.kilitle(vt, { tamamen: true });

    // Sıralı: kilitleme açmanın bitmesini bekler, sonra hem açık anahtarı hem emaneti siler.
    const sira = siraOlustur();
    const ac = sira(() => kasaAc(vt, PAROLA));
    const kilit = sira(() => yonetici.kilitle(vt, { tamamen: true }));
    await ac;
    expect(await kilit).toEqual({ arkaPlan: false });
    expect(kasaAcikMi(vt)).toBe(false);
    expect(yonetici.kilitDurumu(vt).anahtarBellekte).toBe(false);

    // Yanlış parolayla açma hata verir; sıra takılmaz, ardındaki kilitleme yine çalışır.
    await kasaAc(vt, PAROLA);
    yonetici.kilitle(vt); // "sürsün": emanet var
    expect(emanetVarMi(vt)).toBe(true);
    const yanlis = sira(() => kasaAc(vt, 'yanlis-parola-1'));
    const kilit2 = sira(() => yonetici.kilitle(vt, { tamamen: true }));
    await expect(yanlis).rejects.toMatchObject({ kod: 'PAROLA_YANLIS' });
    await kilit2;
    expect(emanetVarMi(vt)).toBe(false);
    expect(kasaAcikMi(vt)).toBe(false);

    // Parola değiştirme (iki KDF await eder) sürerken gelen kilitleme: değiştirme biter, SONRA kilitlenir.
    await kasaAc(vt, PAROLA);
    const degistir = sira(() => parolaDegistir(vt, PAROLA, YENI_PAROLA, { kdf: HIZLI_KDF }));
    const kilit3 = sira(() => yonetici.kilitle(vt, { tamamen: true }));
    await degistir;
    await kilit3;
    expect(kasaAcikMi(vt)).toBe(false);
    expect(yonetici.kilitDurumu(vt).anahtarBellekte).toBe(false);
    await kasaAc(vt, YENI_PAROLA);
  } finally {
    emanetiSil(vt);
    vt.kapat();
    klasor.temizle();
  }
});

test('A (uçtan uca, geçici sunucu): kilitleme ile açılış / parola değiştirme sıraya konur — sonra gelen "Tamamen kilitle" kazanır', async () => {
  test.setTimeout(90_000);
  const klasor = geciciKlasor('arka-plan-sira');
  const vtYolu = join(klasor.yol, 'platform.db');
  const hazir = await veritabaniniHazirla(vtYolu);
  // Kasıtlı YAVAŞ KDF (~1 sn): açma / parola değiştirme uzun süre await eder; kilitleme isteği (250 ms sonra) bu arada gelir.
  // Kuyruğun kendisi yukarıdaki testte deterministik sınanır; bu test sunucu uçlarının kuyruğa bağlı olduğunu doğrular.
  await kasaOlustur(hazir, PAROLA, { kdf: { N: 2 ** 18, r: 8, p: 1 } });
  izinleriAc(hazir);
  ayarYaz(hazir, TERCIH_AYAR_ANAHTARI, { kilitliyken: true, dpapi: false, oturumAcilisi: false });
  kasaKilitle(hazir);
  hazir.kapat();
  const n = await nobetciBaslat(klasor.yol, vtYolu);
  const bekle = (ms: number) => new Promise((c) => setTimeout(c, ms));
  try {
    // Açma (KDF await eder) sürerken tamamen kilitleme isteği gelir.
    const ac = nobetciApi(n, '/platform/kasa/ac', { parola: PAROLA });
    await bekle(250);
    const kilitAc = nobetciApi(n, '/platform/kasa/kilitle', { tamamen: true });
    expect((await ac).basarili).toBe(true);
    expect(await kilitAc).toMatchObject({ basarili: true, arkaPlan: false, kasa: { acik: false } });
    expect(await nobetciApi(n, '/platform/durum')).toMatchObject({ kasa: { acik: false }, zamanlama: { anahtarBellekte: false } });
    // Parola değiştirme sürerken "Tamamen kilitle": değiştirme biter, SONRA kilitlenir (yeni anahtar belleğe geri konmaz).
    expect((await nobetciApi(n, '/platform/kasa/ac', { parola: PAROLA })).basarili).toBe(true);
    const degistir = nobetciApi(n, '/platform/kasa/parola-degistir', { eskiParola: PAROLA, yeniParola: YENI_PAROLA });
    await bekle(250);
    const kilit = nobetciApi(n, '/platform/kasa/kilitle', { tamamen: true });
    expect((await degistir).basarili).toBe(true);
    expect(await kilit).toMatchObject({ basarili: true, kasa: { acik: false } });
    expect(await nobetciApi(n, '/platform/durum')).toMatchObject({ kasa: { acik: false }, zamanlama: { anahtarBellekte: false } });
    expect((await nobetciApi(n, '/platform/projeler')).kod).toBe('KASA_KILITLI');
    expect((await nobetciApi(n, '/platform/kasa/ac', { parola: YENI_PAROLA })).basarili).toBe(true);
  } finally {
    n.surec.kill();
    await new Promise((c) => n.surec.once('exit', c));
    klasor.temizle();
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// B) Windows DPAPI
// ---------------------------------------------------------------------------------------------------------------------

test('B: GERÇEK DPAPI gidiş-dönüş (yalnız Windows; geçici dosya, sahte anahtar)', async () => {
  test.skip(process.platform !== 'win32', 'DPAPI yalnız Windows');
  test.setTimeout(60_000);
  const klasor = geciciKlasor('dpapi-gercek');
  try {
    const anahtar = randomBytes(32);
    const tuz = randomBytes(16);
    const blob = await dpapiKoru(anahtar, tuz);
    expect(blob.length).toBeGreaterThan(anahtar.length);
    expect(blob.includes(anahtar)).toBe(false);
    expect((await dpapiCoz(blob, tuz)).equals(anahtar)).toBe(true);
    // Ek entropi farklıysa çözülmez; hata mesajı gizli değer içermez.
    const hata = await dpapiCoz(blob, randomBytes(16)).catch((h: Error) => h);
    expect(hata).toBeInstanceOf(Error);
    expect(String((hata as Error).message)).not.toContain(anahtar.toString('base64'));

    const yol = join(klasor.yol, 'platform.zamanlayici.dpapi');
    await dpapiDosyasiYaz(yol, anahtar, 'kasa-tuzu-1');
    const ham = readFileSync(yol, 'utf8');
    for (const bicim of ['base64', 'hex', 'base64url'] as const) expect(ham).not.toContain(anahtar.toString(bicim));
    expect(dpapiDosyaBilgisi(yol)).toEqual({ var: true, gecerli: true, kasaTuzu: 'kasa-tuzu-1' });
    expect((await dpapiDosyasiOku(yol, { kasaTuzu: 'kasa-tuzu-1' })).equals(anahtar)).toBe(true);
    await expect(dpapiDosyasiOku(yol, { kasaTuzu: 'kasa-tuzu-2' })).rejects.toMatchObject({ kod: 'ESKI' });
    expect(dosyayiGuvenliSil(yol)).toBe(true);
    expect(existsSync(yol)).toBe(false);
  } finally {
    klasor.temizle();
  }
});

test('B: komut satırında gizli değer yok (stdin); açma parola + onay ister; açılışta yalnız emanete; parola değişince yenilenir / geçersizleşir', async () => {
  const klasor = geciciKlasor('dpapi-akis');
  const log = loglariYakala();
  const { vt } = await hazirVeritabani(klasor.yol);
  const vtYolu = join(klasor.yol, 'platform.db');
  const dpapi = sahteDpapi();
  const gorev = sahteSchtasks();
  const yonetici = arkaPlanYoneticisi({
    veritabaniYolu: () => vtYolu, projeKoku: KOK, denemeSiniri, platform: 'win32', dpapiYurutucu: dpapi.yurutucu, gorevYurutucu: gorev.yurutucu, log: () => {}
  });
  const dosya = dpapiDosyaYolu(vtYolu);
  try {
    expect(dosya).toBe(join(klasor.yol, 'platform.zamanlayici.dpapi'));
    await expect(yonetici.tercihDegistir(vt, { ad: 'dpapi', acik: true, parola: PAROLA })).rejects.toThrow('onaylamalısınız');
    await expect(yonetici.tercihDegistir(vt, { ad: 'dpapi', acik: true, parola: 'yanlis-parola-9', onay: true })).rejects.toMatchObject({ kod: 'PAROLA_YANLIS' });
    expect(existsSync(dosya)).toBe(false);
    const durum = await yonetici.tercihDegistir(vt, { ad: 'dpapi', acik: true, parola: PAROLA, onay: true });
    expect(durum).toMatchObject({ tercihler: { dpapi: true, kilitliyken: false }, windows: true, dpapi: { dosyaVar: true, gecerli: true } });
    // Anahtar komut satırında DEĞİL: argümanlar sabit (betik), gizli değer yalnız stdin'de.
    const anahtar = Buffer.from(acikAnahtar(vt));
    const { komut, argumanlar } = dpapiKomutu();
    expect(dpapi.cagrilar[0].komut).toBe(komut);
    expect(dpapi.cagrilar[0].argumanlar).toEqual(argumanlar);
    expect(argumanlar.join(' ')).not.toContain(anahtar.toString('base64'));
    expect(dpapi.cagrilar[0].stdin).toContain(anahtar.toString('base64'));
    expect(Buffer.from(argumanlar[argumanlar.length - 1], 'base64').toString('utf16le')).toContain('DataProtectionScope]::CurrentUser');
    // Diskte düz anahtar yok.
    const ham = readFileSync(dosya, 'utf8');
    for (const bicim of ['base64', 'hex', 'base64url'] as const) expect(ham).not.toContain(anahtar.toString(bicim));

    // B açıkken kilitleme de "sürsün" seçeneğini sunar (A kapalı olsa da).
    expect(yonetici.kilitSecimiVarMi(vt)).toBe(true);

    // Sunucu açılışı (kasa kilitli): dosya çözülür, anahtar YALNIZ emanete; arayüz kilitli.
    yonetici.kilitle(vt, { tamamen: true });
    expect(emanetVarMi(vt)).toBe(false);
    expect(await yonetici.acilistaYukle(vt)).toBe(true);
    expect(emanetVarMi(vt)).toBe(true);
    expect(kasaDurumu(vt).acik).toBe(false);
    expect(kasaAcikMi(vt)).toBe(false);
    expect(yonetici.kilitDurumu(vt)).toMatchObject({ anahtarBellekte: true, dpapiDosyasi: true });

    // Parola değişti (Ayarlar'dan): dosya yeni anahtarla yenilenir.
    await kasaAc(vt, PAROLA);
    const eskiTuz = dpapiDosyaBilgisi(dosya).kasaTuzu;
    await parolaDegistir(vt, PAROLA, YENI_PAROLA, { kdf: HIZLI_KDF });
    await yonetici.parolaDegisti(vt);
    const yeniBilgi = dpapiDosyaBilgisi(dosya);
    expect(yeniBilgi.kasaTuzu).not.toBe(eskiTuz);
    expect(yeniBilgi.kasaTuzu).toBe(kasaKdfOku(vt)?.tuz);
    emanetiSil(vt);
    kasaKilitle(vt);
    expect(await yonetici.acilistaYukle(vt)).toBe(true);

    // Parola başka yoldan değişti (yenilenmedi): dosya ESKİ → açılışta kullanılmaz, silinir; kasa açılınca tercih kapanır + uyarı.
    await kasaAc(vt, YENI_PAROLA);
    await parolaDegistir(vt, YENI_PAROLA, PAROLA, { kdf: HIZLI_KDF });
    emanetiSil(vt);
    kasaKilitle(vt);
    await expect(dpapiDosyasiOku(dosya, { kasaTuzu: kasaKdfOku(vt)?.tuz, yurutucu: dpapi.yurutucu })).rejects.toMatchObject({ kod: 'ESKI' });
    expect(await yonetici.acilistaYukle(vt)).toBe(false);
    expect(existsSync(dosya)).toBe(false);
    expect(emanetVarMi(vt)).toBe(false);
    await kasaAc(vt, PAROLA);
    yonetici.kasaAcildi(vt);
    const sonra = await yonetici.durum(vt);
    expect(sonra.tercihler.dpapi).toBe(false);
    expect(sonra.uyari).toContain('dosya bulunamadı');

    // Kasa yeniden anahtarlandı ama dosya duruyor (eski tuz): kasa açılınca dosya silinir, tercih kapanır.
    await yonetici.tercihDegistir(vt, { ad: 'dpapi', acik: true, parola: PAROLA, onay: true });
    const d = JSON.parse(readFileSync(dosya, 'utf8'));
    writeFileSync(dosya, JSON.stringify({ ...d, kasaTuzu: 'baska-kasa' }));
    yonetici.kasaAcildi(vt);
    expect(existsSync(dosya)).toBe(false);
    expect((await yonetici.durum(vt)).uyari).toContain('geçersiz');

    // Tercih kapalı ama dosya kalmış (ör. elle kopyalandı): kasa açılınca silinir. Kapatma dosyayı güvenle siler.
    await yonetici.tercihDegistir(vt, { ad: 'dpapi', acik: true, parola: PAROLA, onay: true });
    await yonetici.tercihDegistir(vt, { ad: 'dpapi', acik: false });
    expect(existsSync(dosya)).toBe(false);
    writeFileSync(dosya, '{}');
    yonetici.kasaAcildi(vt);
    expect(existsSync(dosya)).toBe(false);

    // Windows dışında seçenek yok.
    const linux = arkaPlanYoneticisi({ veritabaniYolu: () => vtYolu, projeKoku: KOK, denemeSiniri, platform: 'linux', dpapiYurutucu: dpapi.yurutucu, log: () => {} });
    expect((await linux.durum(vt)).windows).toBe(false);
    expect((await linux.durum(vt)).gorev).toBeNull();
    await expect(linux.tercihDegistir(vt, { ad: 'dpapi', acik: true, parola: PAROLA, onay: true })).rejects.toThrow('yalnız Windows');
    expect(gorev.cagrilar.every((c) => c.argumanlar[0] === '/Query')).toBe(true);
    log.gizliYokMu([PAROLA, YENI_PAROLA, anahtar.toString('base64'), anahtar.toString('hex')]);
    anahtar.fill(0);
  } finally {
    log.birak();
    emanetiSil(vt);
    vt.kapat();
    klasor.temizle();
  }
});

test('B: DPAPI dosyası yedeğe (.tayedek) girmez; paketleme veri/ klasörünü kopyalamaz', async () => {
  const klasor = geciciKlasor('dpapi-yedek');
  const { vt } = await hazirVeritabani(klasor.yol);
  const dpapi = sahteDpapi();
  const yonetici = arkaPlanYoneticisi({
    veritabaniYolu: () => join(klasor.yol, 'platform.db'), projeKoku: KOK, denemeSiniri, platform: 'win32', dpapiYurutucu: dpapi.yurutucu,
    gorevYurutucu: sahteSchtasks().yurutucu, log: () => {}
  });
  try {
    await yonetici.tercihDegistir(vt, { ad: 'dpapi', acik: true, parola: PAROLA, onay: true });
    const dosya = dpapiDosyaYolu(join(klasor.yol, 'platform.db'));
    const blob = JSON.parse(readFileSync(dosya, 'utf8')).blob as string;
    const hedef = join(klasor.yol, 'yedek.tayedek');
    await yedekDosyasiYaz(vt, hedef, { medyaKlasoru: null });
    const acik = await yedekAc(hedef, PAROLA);
    try {
      const metin = JSON.stringify({ ...acik, kasaAnahtari: null, medyaAnahtari: null });
      expect(metin).not.toContain(blob);
      expect(metin).not.toContain('zamanlayici.dpapi');
      expect(metin).not.toContain('nobetci-zamanlayici-anahtari');
      expect(readFileSync(hedef).includes(Buffer.from(blob))).toBe(false);
    } finally {
      acik.kasaAnahtari?.fill(0);
      acik.medyaAnahtari?.fill(0);
    }
    // Taşınabilir paket (Windows ve macOS): kullanıcı verisi (veri/) kopyalanmaz — kopyalanan kökler ortak sabit listede.
    const paketle = readFileSync(join(KOK, 'scripts', 'paketle.mjs'), 'utf8');
    expect(paketle).toContain('for (const g of UYGULAMA_GIRDILERI) kopyala(g)');
    expect(UYGULAMA_GIRDILERI).toContain('scripts');
    expect(UYGULAMA_GIRDILERI.some((g) => /^(veri|\.env)([\\/]|$)/.test(g))).toBe(false);
  } finally {
    vt.kapat();
    klasor.temizle();
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// C) Oturum açılışında arka planda başlatma
// ---------------------------------------------------------------------------------------------------------------------

test('C: görev hedefi, XML ve schtasks komut dizileri (saf); yürütücü SAHTE', async () => {
  // Geliştirme kopyası: proje klasöründeki node + baslat.mjs --arka-plan.
  const gelistirme = gorevHedefi({ projeKoku: 'C:\\Projeler\\Nöbetçi', nodeYolu: 'C:\\Program Files\\nodejs\\node.exe', varMi: () => false });
  expect(gelistirme).toEqual({
    komut: 'C:\\Program Files\\nodejs\\node.exe', argumanlar: [join('C:\\Projeler\\Nöbetçi', 'scripts', 'baslat.mjs'), '--arka-plan'],
    calismaKlasoru: 'C:\\Projeler\\Nöbetçi', paket: false
  });
  // Paketli sürüm: uygulama/ klasörünün üstündeki Nöbetçi.exe --arka-plan.
  const paket = gorevHedefi({ projeKoku: join('D:\\Araclar\\Nöbetçi', 'uygulama'), nodeYolu: 'x', varMi: (y) => y.endsWith('Nöbetçi.exe') });
  expect(paket).toMatchObject({ komut: join('D:\\Araclar\\Nöbetçi', 'Nöbetçi.exe'), argumanlar: ['--arka-plan'], paket: true });

  expect(komutSatiriArgumani('--arka-plan')).toBe('--arka-plan');
  expect(komutSatiriArgumani('C:\\Program Files\\a b\\baslat.mjs')).toBe('"C:\\Program Files\\a b\\baslat.mjs"');
  expect(komutSatiriArgumani('C:\\klasor sonu\\')).toBe('"C:\\klasor sonu\\\\"');

  const xml = gorevXml({ kullanici: 'ALAN\\kullanici', komut: gelistirme.komut, argumanlar: gelistirme.argumanlar, calismaKlasoru: '<&"\'>' });
  expect(xml).toContain('<LogonTrigger>');
  expect(xml.match(/<UserId>ALAN\\kullanici<\/UserId>/g)).toHaveLength(2); // yalnız bu kullanıcının oturumu + kendi hesabı
  expect(xml).toContain('<LogonType>InteractiveToken</LogonType>');
  expect(xml).toContain('<RunLevel>LeastPrivilege</RunLevel>'); // yönetici izni gerekmez
  expect(xml).toContain('<ExecutionTimeLimit>PT0S</ExecutionTimeLimit>');
  expect(xml).toContain('<DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>');
  expect(xml).toContain('<MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>');
  expect(xml).toContain('<Command>C:\\Program Files\\nodejs\\node.exe</Command>');
  expect(xml).toContain(`<Arguments>${join('C:\\Projeler\\Nöbetçi', 'scripts', 'baslat.mjs')} --arka-plan</Arguments>`);
  expect(xml).toContain('<WorkingDirectory>&lt;&amp;&quot;&apos;&gt;</WorkingDirectory>');
  expect(gorevXmlBaytlari(xml).subarray(0, 2).equals(Buffer.from([0xff, 0xfe]))).toBe(true);

  const k = gorevKomutlari('C:\\gecici\\g.xml');
  expect(k.olustur.komut).toMatch(/[\\/]System32[\\/]schtasks\.exe$/);
  expect(k.olustur.argumanlar).toEqual(['/Create', '/TN', 'Nöbetçi (arka plan)', '/XML', 'C:\\gecici\\g.xml', '/F']);
  expect(k.sorgula.argumanlar).toEqual(['/Query', '/TN', 'Nöbetçi (arka plan)']);
  expect(k.sil.argumanlar).toEqual(['/Delete', '/TN', 'Nöbetçi (arka plan)', '/F']);

  // Oluşturma: XML geçici dosyaya yazılır, /Create /XML, dosya silinir, /Query ile doğrulanır.
  const klasor = geciciKlasor('gorev');
  try {
    const sahte = sahteSchtasks();
    const xmlYolu = join(klasor.yol, 'g.xml');
    await gorevOlustur({ xml, xmlYolu, yaz: (y, v) => writeFileSync(y, v), sil: (y) => dosyayiGuvenliSil(y), yurutucu: sahte.yurutucu });
    expect(sahte.cagrilar.map((c) => c.argumanlar[0])).toEqual(['/Create', '/Query']);
    expect(sahte.cagrilar[0].xml).toBe(xml);
    expect(existsSync(xmlYolu)).toBe(false);
    expect(await gorevSil(sahte.yurutucu)).toBe(true);
    expect(sahte.cagrilar.map((c) => c.argumanlar[0])).toEqual(['/Create', '/Query', '/Query', '/Delete']);
    expect(await gorevSil(sahte.yurutucu)).toBe(false); // yoksa silmeye çalışmaz
    const hatali = sahteSchtasks({ olusturmaKodu: 1 });
    await expect(gorevOlustur({ xml, xmlYolu, yaz: (y, v) => writeFileSync(y, v), sil: (y) => dosyayiGuvenliSil(y), yurutucu: hatali.yurutucu })).rejects.toThrow('çıkış kodu 1');
    expect(existsSync(xmlYolu)).toBe(false);
  } finally {
    klasor.temizle();
  }
});

test('C: tercih onay ister; açınca görev eklenir, kapatınca silinir; durum /Query ile gösterilir (SAHTE schtasks)', async () => {
  const klasor = geciciKlasor('gorev-akis');
  const { vt } = await hazirVeritabani(klasor.yol);
  const sahte = sahteSchtasks();
  const yonetici = arkaPlanYoneticisi({
    veritabaniYolu: () => join(klasor.yol, 'platform.db'), projeKoku: KOK, denemeSiniri, platform: 'win32', dpapiYurutucu: sahteDpapi().yurutucu,
    gorevYurutucu: sahte.yurutucu, kullanici: () => 'ALAN\\deneme', geciciKlasor: () => klasor.yol, nodeYolu: 'C:\\node\\node.exe', log: () => {}
  });
  try {
    expect((await yonetici.durum(vt)).gorev).toEqual({ var: false, paket: false, komut: 'C:\\node\\node.exe' });
    await expect(yonetici.tercihDegistir(vt, { ad: 'oturumAcilisi', acik: true })).rejects.toThrow('onay');
    expect(sahte.cagrilar.some((c) => c.argumanlar[0] === '/Create')).toBe(false);
    const r = await yonetici.tercihDegistir(vt, { ad: 'oturumAcilisi', acik: true, onay: true });
    expect(r).toMatchObject({ tercihler: { oturumAcilisi: true }, gorev: { var: true } });
    const olustur = sahte.cagrilar.find((c) => c.argumanlar[0] === '/Create');
    expect(olustur?.xml).toContain('<UserId>ALAN\\deneme</UserId>');
    expect(olustur?.xml).toContain(`<Arguments>${komutSatiriArgumani(join(KOK, 'scripts', 'baslat.mjs'))} --arka-plan</Arguments>`);
    // Geçici XML dosyası kalmadı.
    expect(readdirSync(klasor.yol).filter((a) => a.endsWith('.xml'))).toEqual([]);
    await expect(yonetici.tercihDegistir(vt, { ad: 'oturumAcilisi', acik: false })).rejects.toThrow('onay');
    const k = await yonetici.tercihDegistir(vt, { ad: 'oturumAcilisi', acik: false, onay: true });
    expect(k).toMatchObject({ tercihler: { oturumAcilisi: false }, gorev: { var: false } });
    expect(sahte.kayitliMi()).toBe(false);
    await expect(yonetici.tercihDegistir(vt, { ad: 'bilinmeyen', acik: true })).rejects.toThrow('"ad" geçersiz');
  } finally {
    vt.kapat();
    klasor.temizle();
  }
});

test('C: başlatıcılar --arka-plan bayrağını taşır; paket başlatıcısı konsolsuz (winexe) derlenir', () => {
  const baslat = readFileSync(join(KOK, 'scripts', 'baslat.mjs'), 'utf8');
  expect(baslat).toContain("process.argv.includes('--arka-plan')");
  expect(baslat).toMatch(/windowsHide: true/);
  const cs = readFileSync(join(KOK, 'scripts', 'paket', 'Nobetci.cs'), 'utf8');
  expect(cs).toContain('"--arka-plan"');
  expect(cs).toContain('CreateNoWindow = true');
  expect(cs).toContain('AllocConsole');
  expect(readFileSync(join(KOK, 'scripts', 'paketle.mjs'), 'utf8')).toContain("'/target:winexe'");
});
