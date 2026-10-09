// KORUMA TESTLERİ — ekip paylaşımı: güncel değilken yayınlama (ortak-birlestirme.mjs). Taban (son alınan sürüm), onlar (klasördeki son
// sürüm) ve ben üçlü karşılaştırılır: yalnız onların yaptıkları listelenir; dahil edilen / "onunki" seçilenler alınır, benimkiler kalır.
import { expect, test } from '@playwright/test';
import { acikAnahtar, kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { ekranKaydet, projeKaydet, senaryoGetir, senaryoKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { yedekIceAktar, yedekOlustur } from '../../scripts/platform/yedek.mjs';
import { hazirligiAt, iceAktarmaHazirla, iceAktarmaUygula } from '../../scripts/platform/ice-aktarma.mjs';
import { ortakAlindiIsaretle, ortakDurum, ortakKlasorAyarla, ortakSurumDosyasi, ortakYayinla } from '../../scripts/platform/ortak-paylasim.mjs';
import { birlestirmeSecimi, eklediklerimiSil, ucluFark } from '../../scripts/platform/ortak-birlestirme.mjs';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';

const PAROLA = 'Ekip-Birlestirme-Parolasi-1';

test('üçlü fark: onların yenisi / değişikliği / çakışma / silme listelenir, benimkiler listelenmez; seçime göre birleşir ve yayınlanır', async () => {
  const klasor = geciciKlasor('ortak-birlestirme');
  try {
    const a = await veritabaniniHazirla(null);
    await kasaOlustur(a, PAROLA, { kdf: HIZLI_KDF });
    const proje = projeKaydet(a, { ad: 'Ekip' });
    const ekran = ekranKaydet(a, { projeId: proje, anahtar: 'form', ad: 'Form' });
    const s = (baslik: string, adim: number, id?: string) => senaryoKaydet(a, { ...(id ? { id } : {}), projeId: proje, ekranId: ekran, baslik, icerik: { adim } });
    const s1 = s('S1', 1); const s2 = s('S2', 2); const s4 = s('S4', 4); const s5 = s('S5', 5);
    ortakKlasorAyarla(a, klasor.yol);
    expect((await ortakYayinla(a, { yapan: 'dogukan' })).surum).toBe(1);

    // B: v1'i alır (aynı kasa).
    const b = await veritabaniniHazirla(null);
    await yedekIceAktar(b, yedekOlustur(a).veri, PAROLA, { mod: 'tamYukle', medyaKlasoru: null });
    ortakKlasorAyarla(b, klasor.yol);
    ortakAlindiIsaretle(b, 1);

    // A (onlar): S1 değişir, S3 eklenir, S4 değişir, S5 silinir → v2.
    s('S1', 10, s1);
    const s3 = s('S3', 3);
    s('S4', 40, s4);
    a.calistir('DELETE FROM senaryolar WHERE id = ?', [s5]);
    expect((await ortakYayinla(a, { yapan: 'dogukan' })).surum).toBe(2);

    // B (ben): S2 ve S4 değişir; güncel değil.
    senaryoKaydet(b, { id: s2, projeId: proje, ekranId: ekran, baslik: 'S2', icerik: { adim: 20 } });
    senaryoKaydet(b, { id: s4, projeId: proje, ekranId: ekran, baslik: 'S4', icerik: { adim: 400 } });
    expect(ortakDurum(b).guncelleVar).toBe(true);
    await expect(ortakYayinla(b)).rejects.toThrow('önce güncelleyin');

    const taban = await iceAktarmaHazirla(b, ortakSurumDosyasi(b, 1).yol, PAROLA, { medyaKlasoru: null });
    const onlar = await iceAktarmaHazirla(b, ortakSurumDosyasi(b, 2).yol, PAROLA, { medyaKlasoru: null });
    const farklar = ucluFark(b, taban.tablolar, onlar.tablolar, acikAnahtar(b));
    hazirligiAt(taban);
    const senaryolar = farklar.filter((f) => f.tablo === 'senaryolar').map((f) => [f.baslik, f.tur]).sort();
    expect(senaryolar).toEqual([['S1', 'degisti'], ['S2', 'benimDegisti'], ['S3', 'yeni'], ['S4', 'cakisma'], ['S5', 'silindi']]);
    expect(farklar.find((f) => f.id === s1)?.alanlar.join(',')).toContain('icerik');
    // Senaryolar dışında listelenen bir şey yok (kişiye / makineye özel ayarlar karşılaştırılmaz).
    expect(farklar.filter((f) => f.tablo !== 'senaryolar')).toEqual([]);

    // Çakışmada karar zorunlu.
    expect(() => birlestirmeSecimi(farklar, {})).toThrow('Çakışan kayıt için karar verin');
    const secim = birlestirmeSecimi(farklar, { [`senaryolar:${s3}`]: 'haric', [`senaryolar:${s4}`]: 'benimki' });
    expect(secim).toEqual({ secimler: { senaryolar: [s1] }, silinecekler: [], dahil: 1, haric: 2, geriAlinan: 0 });

    iceAktarmaUygula(b, onlar, { secimler: secim.secimler }, { yapan: 'birim-test' });
    hazirligiAt(onlar);
    expect(senaryoGetir(b, s1)?.icerik).toEqual({ adim: 10 }); // onunki dahil edildi
    expect(senaryoGetir(b, s2)?.icerik).toEqual({ adim: 20 }); // benimki kaldı
    expect(senaryoGetir(b, s4)?.icerik).toEqual({ adim: 400 }); // çakışmada benimki
    expect(senaryoGetir(b, s3)).toBeUndefined(); // dahil edilmedi
    expect(senaryoGetir(b, s5)).toBeTruthy(); // onların silmesi bilgi: bende kalır

    ortakAlindiIsaretle(b, 2);
    expect((await ortakYayinla(b, { yapan: 'recep', not: 'birleşik' })).surum).toBe(3);
    expect(ortakDurum(b)).toMatchObject({ benimSurum: 3, sonSurum: 3, guncelleVar: false });

    // Güncelken (taban = son sürüm) yalnız benim yaptıklarım çıkar; dahil edilmeyen değişiklik son sürümdeki hâline döner, eklediğim silinir.
    senaryoKaydet(b, { id: s1, projeId: proje, ekranId: ekran, baslik: 'S1', icerik: { adim: 99 } });
    const s6 = senaryoKaydet(b, { projeId: proje, ekranId: ekran, baslik: 'S6', icerik: { adim: 6 } });
    const v3 = await iceAktarmaHazirla(b, ortakSurumDosyasi(b, 3).yol, PAROLA, { medyaKlasoru: null });
    const benim = ucluFark(b, v3.tablolar, v3.tablolar, acikAnahtar(b));
    expect(benim.map((f) => [f.baslik, f.tur]).sort()).toEqual([['S1', 'benimDegisti'], ['S6', 'benimYeni']]);
    const geri = birlestirmeSecimi(benim, { [`senaryolar:${s1}`]: 'haric', [`senaryolar:${s6}`]: 'haric' });
    expect(geri).toMatchObject({ secimler: { senaryolar: [s1] }, silinecekler: [{ tablo: 'senaryolar', id: s6 }], geriAlinan: 2 });
    iceAktarmaUygula(b, v3, { secimler: geri.secimler }, { yapan: 'birim-test' });
    hazirligiAt(v3);
    expect(eklediklerimiSil(b, geri.silinecekler, 'recep')).toBe(1);
    expect(senaryoGetir(b, s1)?.icerik).toEqual({ adim: 10 });
    expect(senaryoGetir(b, s6)).toBeUndefined();
    expect(String(b.tek("SELECT aciklama FROM degisiklik_gecmisi WHERE varlik_id = ? AND islem = 'sil'", [s6])?.aciklama)).toContain('geri alındı');
    a.kapat();
    b.kapat();
  } finally {
    klasor.temizle();
  }
});
