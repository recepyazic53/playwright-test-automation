// KORUMA TESTLERİ — servis taban adreslerinin toplu düzenlenmesi (scripts/platform/servisler/taban-adresleri.mjs): etki önizlemesi
// onaysız hiçbir şey yazmaz; adlandırılmış taban adresteki servisler aynı kalmalı; http(s) ve yasak adres denetimi; eski tam adres
// ayarı düzenlenen hücrede kalkar. Geçici klasör; ağ isteği YOK.
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { servisGetir, servisKaydet, servisSenaryosuKaydet } from '../../scripts/platform/servisler/servis-deposu.mjs';
import { servisTabanBaglantisi, tabanAdresiIslemi, tabanlariUygula, tabanTablosu } from '../../scripts/platform/servisler/taban-adresleri.mjs';
import { servisAdresi } from '../../scripts/platform/servisler/servis-islemleri.mjs';
import { yasakAdresleriKaydet } from '../../scripts/platform/guvenlik/yasak-adresler.mjs';
import { geciciKlasor, HIZLI_KDF } from './platform-ortak';

test.describe('servis taban adresleri', () => {
  const klasor = geciciKlasor('taban');
  let vt: Veritabani;
  test.afterAll(() => { vt?.kapat(); klasor.temizle(); });

  test('önizleme → onay; ad (grup) tutarlılığı; adres ve yasak adres denetimi', async () => {
    vt = await veritabaniniHazirla(join(klasor.yol, 'p.db'));
    await kasaOlustur(vt, 'Deneme-Parola-123!', { kdf: HIZLI_KDF });
    const projeId = projeKaydet(vt, { ad: 'P' });
    const test1 = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: 'https://test.ornek.test', varsayilan: true, ayarlar: { riskli: false } });
    const canli = ortamKaydet(vt, { projeId, ad: 'CANLI', tabanUrl: 'https://canli.ornek.test', ayarlar: { canli: true } });
    const a = servisKaydet(vt, { projeId, anahtar: 'a', ad: 'A', ayarlar: { yol: '/a.asmx', tabanlar: { [test1]: 'https://eski.ornek.test' }, erisim: { ortamId: test1, zaman: 'x', durumKodu: 200 } } });
    const b = servisKaydet(vt, { projeId, anahtar: 'b', ad: 'B', tur: 'rest', ayarlar: { yol: '/b', adresler: { [canli]: 'https://tam.ornek.test/b' } } });
    servisSenaryosuKaydet(vt, { projeId, servisId: a, baslik: 'S1', icerik: { operasyon: 'Op', govde: '<x/>', kontroller: [] } });

    const t = tabanTablosu(vt, projeId);
    const hucre = (id: string, o: string) => t.satirlar.find((s) => s.servisId === id)?.tabanlar[o];
    expect(hucre(a, test1)).toEqual({ deger: 'https://eski.ornek.test', kaynak: 'servis' });
    expect(hucre(a, canli)).toEqual({ deger: 'https://canli.ornek.test', kaynak: 'ortam' });
    expect(hucre(b, canli)?.kaynak).toBe('eski');

    // Önizleme: yazmaz; etki (senaryo sayısı, eski → yeni) döner.
    const degisiklikler = { [a]: { tabanlar: { [test1]: 'https://yeni.ornek.test/' }, grup: 'Çekirdek' }, [b]: { tabanlar: { [test1]: 'https://yeni.ornek.test', [canli]: null }, grup: 'Çekirdek' } };
    const on = tabanlariUygula(vt, projeId, { degisiklikler });
    expect(on.uygulandi).toBeUndefined();
    expect(on.onizleme.toplam).toEqual({ servis: 2, senaryo: 1, akis: 0 });
    expect(on.onizleme.servisler.find((s) => s.servisId === a)?.adresler).toEqual([
      { ortamId: test1, ortam: 'TEST', eski: { deger: 'https://eski.ornek.test', kaynak: 'servis' }, yeni: { deger: 'https://yeni.ornek.test', kaynak: 'servis' } }
    ]);
    expect(servisGetir(vt, a)?.ayarlar.tabanlar?.[test1]).toBe('https://eski.ornek.test');

    // Aynı addaki servislerin adresleri farklıysa reddedilir.
    expect(() => tabanlariUygula(vt, projeId, { degisiklikler: { [a]: { grup: 'Çekirdek' }, [b]: { grup: 'Çekirdek' } } })).toThrow(/aynı olmalı/);
    expect(() => tabanlariUygula(vt, projeId, { degisiklikler: { [a]: { tabanlar: { [test1]: 'ftp://x' } } } })).toThrow(/http/);
    yasakAdresleriKaydet(vt, ['*.yasak.test']);
    expect(() => tabanlariUygula(vt, projeId, { degisiklikler: { [a]: { tabanlar: { [test1]: 'https://api.yasak.test' } } } })).toThrow(/yasak/);

    // Onay: yazılır; eski tam adres ayarı kalkar; adresi değişen ortamın erişim kaydı silinir; REST türü korunur.
    const r = tabanlariUygula(vt, projeId, { degisiklikler, onay: true });
    expect(r.uygulandi).toBe(true);
    const sa = servisGetir(vt, a);
    const sb = servisGetir(vt, b);
    expect(sa?.ayarlar.tabanlar).toEqual({ [test1]: 'https://yeni.ornek.test' });
    expect(sa?.ayarlar.erisim).toBeUndefined();
    expect(sa?.ayarlar.tabanGrubu).toBe('Çekirdek');
    expect(sb?.ayarlar.adresler).toEqual({});
    expect(sb?.tur).toBe('rest');

    // "Bu ortamda yok" olan servis adı bozmaz: yalnız tanımlı ortamlarda aynı olmalı ("yok" korunur).
    const c = servisKaydet(vt, { projeId, anahtar: 'c', ad: 'C', ayarlar: { yol: '/c', tabanlar: { [test1]: 'https://yeni.ornek.test', [canli]: '' } } });
    tabanlariUygula(vt, projeId, { degisiklikler: { [c]: { grup: 'Çekirdek' } }, onay: true });
    expect(servisGetir(vt, c)?.ayarlar).toMatchObject({ tabanGrubu: 'Çekirdek', tabanlar: { [test1]: 'https://yeni.ornek.test', [canli]: '' } });
    expect(() => tabanlariUygula(vt, projeId, { degisiklikler: { [c]: { tabanlar: { [test1]: 'https://baska.ornek.test' } } } })).toThrow(/aynı olmalı/);
  });
});

test.describe('adlandırılmış taban adresleri (ana liste)', () => {
  const klasor = geciciKlasor('taban-adlari');
  let vt: Veritabani;
  test.afterAll(() => { vt?.kapat(); klasor.temizle(); });

  test('eski veriyle uyum; değiştir / sil / ekle: önizleme yazmaz, onayla yazılır; boş kalan servis koşuda anlaşılır hata verir', async () => {
    vt = await veritabaniniHazirla(join(klasor.yol, 'p.db'));
    await kasaOlustur(vt, 'Deneme-Parola-123!', { kdf: HIZLI_KDF });
    const projeId = projeKaydet(vt, { ad: 'P' });
    const T = ortamKaydet(vt, { projeId, ad: 'TEST', tabanUrl: 'https://test.ornek.invalid', varsayilan: true, ayarlar: { riskli: false } });
    const C = ortamKaydet(vt, { projeId, ad: 'CANLI', tabanUrl: 'https://canli.ornek.invalid', ayarlar: { canli: true } });
    const ortak = { [T]: 'https://api-test.ornek.invalid', [C]: 'https://api.ornek.invalid' };
    const a = servisKaydet(vt, { projeId, anahtar: 'a', ad: 'A', ayarlar: { yol: '/a.asmx', tabanlar: ortak, tabanGrubu: 'Çekirdek' } });
    const b = servisKaydet(vt, { projeId, anahtar: 'b', ad: 'B', ayarlar: { yol: '/b.asmx', tabanlar: { [T]: ortak[T], [C]: '' }, tabanGrubu: 'Çekirdek' } });
    const c = servisKaydet(vt, { projeId, anahtar: 'c', ad: 'C', ayarlar: { yol: '/c.asmx', tabanlar: { [T]: 'https://ozel.ornek.invalid' } } });
    const d = servisKaydet(vt, { projeId, anahtar: 'd', ad: 'D', ayarlar: { yol: '/d.asmx', tabanlar: { [T]: '', [C]: '' } } });
    servisSenaryosuKaydet(vt, { projeId, servisId: a, baslik: 'S1', icerik: { operasyon: 'Op', govde: '<x/>', kontroller: [] } });
    const ay = (id: string) => servisGetir(vt, id)?.ayarlar;
    const canliOrtam = { id: C, ad: 'CANLI', tabanUrl: 'https://canli.ornek.invalid' };

    // Geriye uyum: kaydı olmayan eski ad bağlı servislerin adresinden türetilir; adsız (özel adresli) servisler ad olarak listede yok.
    expect(tabanTablosu(vt, projeId).tabanAdlari).toEqual([{ ad: 'Çekirdek', adresler: ortak, kayitli: false, kullanan: [a, b] }]);

    // Değiştir: önizleme etkiyi (eski → yeni, senaryo sayısı) verir ama yazmaz; servise özel "bu ortamda yok" korunur.
    const yeniTest = 'https://api2-test.ornek.invalid';
    const on = tabanAdresiIslemi(vt, projeId, { islem: 'degistir', ad: 'Çekirdek', adresler: { [T]: yeniTest } });
    expect(on.uygulandi).toBeUndefined();
    expect(on.onizleme.toplam).toEqual({ servis: 2, senaryo: 1, akis: 0 });
    expect(on.onizleme.bosKalacaklar).toEqual([]);
    expect(on.onizleme.servisler.find((s) => s.servisId === a)?.adresler).toEqual([
      { ortamId: T, ortam: 'TEST', eski: { deger: ortak[T], kaynak: 'servis' }, yeni: { deger: yeniTest, kaynak: 'servis' } }]);
    expect(ay(a)?.tabanlar?.[T]).toBe(ortak[T]);
    tabanAdresiIslemi(vt, projeId, { islem: 'degistir', ad: 'Çekirdek', adresler: { [T]: yeniTest }, onay: true });
    expect(ay(a)?.tabanlar).toEqual({ [T]: yeniTest, [C]: ortak[C] });
    expect(ay(b)?.tabanlar).toEqual({ [T]: yeniTest, [C]: '' });
    expect(tabanTablosu(vt, projeId).tabanAdlari[0]).toMatchObject({ ad: 'Çekirdek', kayitli: true, adresler: { [T]: yeniTest, [C]: ortak[C] } });

    // Bir ortamın adresini silmek: bağlı servisler o ortamda BOŞ kalır (önizlemede listelenir); koşuda anlaşılır hata.
    const bos = tabanAdresiIslemi(vt, projeId, { islem: 'degistir', ad: 'Çekirdek', adresler: { [C]: '' } });
    expect(bos.onizleme.bosKalacaklar).toEqual([{ servisId: a, ad: 'A', ortamlar: ['CANLI'] }]);
    tabanAdresiIslemi(vt, projeId, { islem: 'degistir', ad: 'Çekirdek', adresler: { [C]: '' }, onay: true });
    expect(ay(a)?.tabanlar?.[C]).toBe('');
    expect(() => servisAdresi(ay(a) ?? {}, canliOrtam))
      .toThrow('Servis "CANLI" ortamında tanımlı değil: taban adresi tanımlı değil ("Çekirdek" taban adresinin bu ortamda adresi yok).');
    // Adres yeniden yazılınca (tüm bağlı servisler o ortamda boştu) hepsi yeni adresi alır.
    tabanAdresiIslemi(vt, projeId, { islem: 'degistir', ad: 'Çekirdek', adresler: { [C]: ortak[C] }, onay: true });
    expect(ay(a)?.tabanlar?.[C]).toBe(ortak[C]);
    expect(ay(b)?.tabanlar?.[C]).toBe(ortak[C]);

    // Ad değiştirme: bağlı servislerin adı da değişir; aynı ad reddedilir; geçersiz / yasak adres reddedilir.
    tabanAdresiIslemi(vt, projeId, { islem: 'degistir', ad: 'Çekirdek', yeniAd: 'Ana sunucu', onay: true });
    expect(ay(a)?.tabanGrubu).toBe('Ana sunucu');
    expect(tabanTablosu(vt, projeId).tabanAdlari.map((t) => t.ad)).toEqual(['Ana sunucu']);
    expect(() => tabanAdresiIslemi(vt, projeId, { islem: 'ekle', ad: 'ana SUNUCU', adresler: { [T]: yeniTest } })).toThrow(/zaten var/);
    expect(() => tabanAdresiIslemi(vt, projeId, { islem: 'ekle', ad: 'X', adresler: { [T]: 'ftp://x' } })).toThrow(/http/);
    expect(() => tabanAdresiIslemi(vt, projeId, { islem: 'ekle', ad: 'X', adresler: {} })).toThrow(/En az bir ortam/);
    yasakAdresleriKaydet(vt, ['*.yasak.invalid']);
    expect(() => tabanAdresiIslemi(vt, projeId, { islem: 'ekle', ad: 'X', adresler: { [T]: 'https://api.yasak.invalid' } })).toThrow(/yasak/);

    // Ekle: seçilen servisler bağlanır (tabanın adresi olmayan ortamda "yok"); seçilmeyen değişmez; önizleme yazmaz.
    const eklenecek = { [T]: 'https://yeni-test.ornek.invalid', [C]: '' };
    const ek = tabanAdresiIslemi(vt, projeId, { islem: 'ekle', ad: 'Yeni', adresler: eklenecek, baglanacaklar: [d] });
    expect(ek.onizleme.servisler.map((s) => s.ad)).toEqual(['D']);
    expect(tabanTablosu(vt, projeId).tabanAdlari.map((t) => t.ad)).toEqual(['Ana sunucu']);
    tabanAdresiIslemi(vt, projeId, { islem: 'ekle', ad: 'Yeni', adresler: eklenecek, baglanacaklar: [d], onay: true });
    expect(ay(d)).toMatchObject({ tabanGrubu: 'Yeni', tabanlar: eklenecek });
    expect(ay(c)?.tabanlar).toEqual({ [T]: 'https://ozel.ornek.invalid' });
    // Servisi olmayan taban da listede kalır.
    tabanAdresiIslemi(vt, projeId, { islem: 'ekle', ad: 'Boş taban', adresler: { [T]: 'https://bos.ornek.invalid' }, onay: true });
    expect(tabanTablosu(vt, projeId).tabanAdlari.find((t) => t.ad === 'Boş taban')).toMatchObject({ kayitli: true, kullanan: [], adresler: { [T]: 'https://bos.ornek.invalid', [C]: '' } });

    // Servis bazında düzenleme kayıtlı tabanı da günceller.
    tabanlariUygula(vt, projeId, { degisiklikler: { [d]: { tabanlar: { [T]: 'https://yeni2-test.ornek.invalid' } } }, onay: true });
    expect(tabanTablosu(vt, projeId).tabanAdlari.find((t) => t.ad === 'Yeni')?.adresler[T]).toBe('https://yeni2-test.ornek.invalid');

    // Sil: önizleme boş kalacak servisleri listeler, onaysız hiçbir şey değişmez; onayla tüm ortam adresleri boş kalır, bağlar kalkar.
    const sil = tabanAdresiIslemi(vt, projeId, { islem: 'sil', ad: 'Ana sunucu' });
    expect(sil.onizleme.bosKalacaklar).toEqual([{ servisId: a, ad: 'A', ortamlar: ['CANLI', 'TEST'] }, { servisId: b, ad: 'B', ortamlar: ['CANLI', 'TEST'] }]);
    expect(ay(a)?.tabanGrubu).toBe('Ana sunucu');
    tabanAdresiIslemi(vt, projeId, { islem: 'sil', ad: 'Ana sunucu', onay: true });
    expect(ay(a)?.tabanGrubu).toBeUndefined();
    expect(ay(a)?.tabanlar).toEqual({ [T]: '', [C]: '' });
    expect(() => servisAdresi(ay(a) ?? {}, canliOrtam)).toThrow('Servis "CANLI" ortamında tanımlı değil: taban adresi tanımlı değil.');
    expect(tabanTablosu(vt, projeId).tabanAdlari.map((t) => t.ad)).toEqual(['Boş taban', 'Yeni']);

    // Servis sayfası bağlantısı: adresler seçilen tabandan gelir.
    expect(servisTabanBaglantisi(vt, projeId, c, 'Yeni')).toEqual({ tabanlar: { [T]: 'https://yeni2-test.ornek.invalid', [C]: '' } });
    expect(() => servisTabanBaglantisi(vt, projeId, c, 'Yok böyle')).toThrow(/bulunamadı/);
  });
});
