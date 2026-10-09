// KORUMA TESTLERİ — ortak (ekip) yedek: yayında kişiye özel bilgi ayıklanır, içe aktarmada yerel kişisel değer korunur.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { veritabaniAc } from '../../scripts/platform/veritabani/baglanti.mjs';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { baglantiKaydet, baglantilariListele } from '../../scripts/platform/entegrasyonlar/depo.mjs';
import {
  ekranKaydet, girisProfiliGetir, girisProfiliKaydet, kosuOlustur, kosuSonucuEkle, ortamKaydet, projeKaydet,
  senaryoGetir, senaryoKaydet, sayimlar, veritabaniniHazirla
} from '../../scripts/platform/veritabani/depo.mjs';
import { yedekAc, yedekDosyasiYaz, yedekIceAktar, yedekOlustur } from '../../scripts/platform/yedek.mjs';
import { iceAktarmaHazirla, iceAktarmaUygula } from '../../scripts/platform/ice-aktarma.mjs';
import { ortakAlindiIsaretle, ortakDurum, ortakKlasorAyarla, ortakSurumDosyasi, ortakYayinla } from '../../scripts/platform/ortak-paylasim.mjs';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';

const PAROLA = 'Ekip-Ortak-Kasa-Parolasi-1';
const A_GIRIS = 'AGirisParolasi#7701';
const A_DB = 'ADbParolasi#7702';
const B_GIRIS = 'BGirisParolasi#7703';
const B_DB = 'BDbParolasi#7704';
void veritabaniAc;

test('ortak yedek kişisel bilgiyi ayıklar; içe aktaran kendi bilgisini korur, ortak içerik gelir', async () => {
  const klasor = geciciKlasor('ortak-yedek');
  try {
    const a = await veritabaniniHazirla(null);
    await kasaOlustur(a, PAROLA, { kdf: HIZLI_KDF });
    const proje = projeKaydet(a, { ad: 'Ortak' });
    const ortam = ortamKaydet(a, { projeId: proje, ad: 'Test', tabanUrl: 'https://o.ornek.test', varsayilan: true, ayarlar: { riskli: false } });
    const profil = girisProfiliKaydet(a, { projeId: proje, ortamId: ortam, ad: 'Ana', kullaniciAdi: 'a-kullanici', parola: A_GIRIS });
    const ekran = ekranKaydet(a, { projeId: proje, anahtar: 'form', ad: 'Form' });
    const s1 = senaryoKaydet(a, { projeId: proje, ekranId: ekran, baslik: 'Senaryo 1', icerik: { adim: 1 } });
    const kosu = kosuOlustur(a, { projeId: proje, ortamId: ortam });
    kosuSonucuEkle(a, { kosuId: kosu, senaryoId: s1, senaryoBaslik: 'Senaryo 1', durum: 'basarili', hataMesaji: null });
    const dbAlanlari = { surucu: 'postgres', sunucu: 'db.ornek.test', veritabani: 'x', kullanici: 'a-db', parola: A_DB, tls: 'kapali', zamanAsimiSn: 10, yalnizOkuma: true };
    const bag = baglantiKaydet(a, proje, { tur: 'veritabani', ad: 'DB', alanlar: dbAlanlari, olaylar: [] });

    const dosya = join(klasor.yol, 'ortak.tayedek');
    await yedekDosyasiYaz(a, dosya, { ortak: true, medyaKlasoru: null });
    const acik = await yedekAc(dosya, PAROLA);
    expect(acik.manifest.ortak).toBe(true);
    const t = acik.tablolar;
    expect(t.giris_profilleri[0].kullanici_adi).toBe('');
    expect(t.giris_profilleri[0].parola).toBeNull();
    expect(t.kosular ?? []).toHaveLength(0);
    expect(t.senaryolar).toHaveLength(1);
    expect(JSON.stringify(t)).not.toContain(A_DB);

    // B: aynı kasayı benimser, kendi bilgilerini girer
    const b = await veritabaniniHazirla(null);
    await yedekIceAktar(b, yedekOlustur(a).veri, PAROLA, { mod: 'tamYukle', medyaKlasoru: null });
    girisProfiliKaydet(b, { id: profil, projeId: proje, ortamId: ortam, ad: 'Ana', kullaniciAdi: 'b-kullanici', parola: B_GIRIS });
    baglantiKaydet(b, proje, { id: bag.id, tur: 'veritabani', ad: 'DB', alanlar: { ...dbAlanlari, kullanici: 'b-db', parola: B_DB }, olaylar: [] });

    // A yeni senaryo ekleyip yeniden yayınlar
    senaryoKaydet(a, { projeId: proje, ekranId: ekran, baslik: 'Senaryo 2', icerik: { adim: 2 } });
    await yedekDosyasiYaz(a, dosya, { ortak: true, medyaKlasoru: null });

    const hazirlik = await iceAktarmaHazirla(b, dosya, PAROLA);
    iceAktarmaUygula(b, hazirlik, { tumu: true }, { yapan: 'birim-test' });

    expect(sayimlar(b).senaryolar).toBe(2);
    expect(senaryoGetir(b, s1)).toBeTruthy();
    expect(girisProfiliGetir(b, profil, { coz: true })).toMatchObject({ kullaniciAdi: 'b-kullanici', parola: B_GIRIS });
    const ent = baglantilariListele(b, proje).find((x) => x.id === bag.id);
    expect(ent).toBeTruthy();
    b.kapat();
    a.kapat();
  } finally {
    klasor.temizle();
  }
});

test('ortak klasör: sürümlü yayın, güncelleme uyarısı ve "önce güncelleyin" koruması', async () => {
  const klasor = geciciKlasor('ortak-klasor');
  try {
    const a = await veritabaniniHazirla(null);
    await kasaOlustur(a, PAROLA, { kdf: HIZLI_KDF });
    const proje = projeKaydet(a, { ad: 'Ortak' });
    const ekran = ekranKaydet(a, { projeId: proje, anahtar: 'form', ad: 'Form' });
    senaryoKaydet(a, { projeId: proje, ekranId: ekran, baslik: 'Senaryo 1', icerik: { adim: 1 } });
    const paylasim = join(klasor.yol, 'paylasim');
    expect(() => ortakKlasorAyarla(a, join(klasor.yol, 'yok'))).toThrow('bulunamadı');
    mkdirSync(paylasim);
    ortakKlasorAyarla(a, paylasim);

    const v1 = await ortakYayinla(a, { yapan: 'ayse', not: 'ilk' });
    expect(v1).toMatchObject({ surum: 1, yapan: 'ayse', not: 'ilk' });
    expect(ortakDurum(a)).toMatchObject({ sonSurum: 1, benimSurum: 1, guncelleVar: false });

    // B: aynı kasayı benimser; yayınlanan sürümü alır
    const b = await veritabaniniHazirla(null);
    await yedekIceAktar(b, yedekOlustur(a).veri, PAROLA, { mod: 'tamYukle', medyaKlasoru: null });
    ortakKlasorAyarla(b, paylasim);
    expect(ortakDurum(b)).toMatchObject({ sonSurum: 1, benimSurum: 0, guncelleVar: true });

    // A ikinci sürümü yayınlar; B güncellemeden yayınlayamaz
    senaryoKaydet(a, { projeId: proje, ekranId: ekran, baslik: 'Senaryo 2', icerik: { adim: 2 } });
    await ortakYayinla(a, { yapan: 'ayse' });
    await expect(ortakYayinla(b, { yapan: 'can' })).rejects.toMatchObject({ kod: 'ONCE_GUNCELLE' });

    const { yol, kayit } = ortakSurumDosyasi(b);
    expect(kayit.surum).toBe(2);
    const hazirlik = await iceAktarmaHazirla(b, yol, PAROLA);
    iceAktarmaUygula(b, hazirlik, { tumu: true }, { yapan: 'can' });
    ortakAlindiIsaretle(b, kayit.surum);
    expect(sayimlar(b).senaryolar).toBe(2);
    expect(ortakDurum(b).guncelleVar).toBe(false);

    const v3 = await ortakYayinla(b, { yapan: 'can' });
    expect(v3.surum).toBe(3);
    expect(ortakDurum(b).surumler.map((s) => s.surum)).toEqual([3, 2, 1]);
    // Ortak ayarlar yedeğe girmez (makineye özel)
    const acik = await yedekAc(join(paylasim, v3.dosya), PAROLA);
    expect((acik.tablolar.ayarlar ?? []).some((s) => String(s.anahtar).startsWith('ortak-'))).toBe(false);
    a.kapat();
    b.kapat();
  } finally {
    klasor.temizle();
  }
});
