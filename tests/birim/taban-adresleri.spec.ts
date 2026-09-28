// KORUMA TESTLERİ — servis taban adreslerinin toplu düzenlenmesi (scripts/platform/servisler/taban-adresleri.mjs): etki önizlemesi
// onaysız hiçbir şey yazmaz; adlandırılmış taban adresteki servisler aynı kalmalı; http(s) ve yasak adres denetimi; eski tam adres
// ayarı düzenlenen hücrede kalkar. Geçici klasör; ağ isteği YOK.
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { servisGetir, servisKaydet, servisSenaryosuKaydet } from '../../scripts/platform/servisler/servis-deposu.mjs';
import { TabanKarariHatasi, servisTabanBaglantisi, tabanAdresiIslemi, tabanlariUygula, tabanTablosu } from '../../scripts/platform/servisler/taban-adresleri.mjs';
import { postmanAktar, servisAdresi, servisiKaydet } from '../../scripts/platform/servisler/servis-islemleri.mjs';
import { restServisiKaydet } from '../../scripts/platform/servisler/rest-servisi.mjs';
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
    // Bağlı servisin adresi tabandan farklılaşıyor: karar sorulur (sessizce yazılmaz).
    expect(() => tabanlariUygula(vt, projeId, { degisiklikler: { [c]: { tabanlar: { [test1]: 'https://baska.ornek.test' } } } }))
      .toThrow('"C" "Çekirdek" taban adresine bağlı; yeni adres farklı (TEST: https://yeni.ornek.test → https://baska.ornek.test).');
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

    // Servis bazında düzenleme: bağlı servisin adresi tabandan farklılaşırsa karar sorulur; "Tabanın adresini güncelle" kayıtlı tabanı da günceller.
    expect(() => tabanlariUygula(vt, projeId, { degisiklikler: { [d]: { tabanlar: { [T]: 'https://yeni2-test.ornek.invalid' } } }, onay: true })).toThrow(TabanKarariHatasi);
    tabanlariUygula(vt, projeId, { degisiklikler: { [d]: { tabanlar: { [T]: 'https://yeni2-test.ornek.invalid' } } }, onay: true, tabanKararlari: { [d]: 'tabaniGuncelle' } });
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

test.describe('taban adresine bağlı servisin adresi başka yoldan değişirken karar', () => {
  const klasor = geciciKlasor('taban-karari');
  let vt: Veritabani;
  let projeId = '';
  let T = '';
  let C = '';
  const ortak = () => ({ [T]: 'https://api-test.ornek.invalid', [C]: 'https://api.ornek.invalid' });
  test.afterAll(() => { vt?.kapat(); klasor.temizle(); });
  const ay = (id: string) => servisGetir(vt, id)?.ayarlar;
  /** Karar hatası (yoksa test düşer). */
  const kararHatasi = (fn: () => unknown): TabanKarariHatasi => {
    try { fn(); } catch (e) { if (e instanceof TabanKarariHatasi) return e; throw e; }
    throw new Error('karar sorulmadı');
  };

  test.beforeAll(async () => {
    vt = await veritabaniniHazirla(join(klasor.yol, 'p.db'));
    await kasaOlustur(vt, 'Deneme-Parola-123!', { kdf: HIZLI_KDF });
    projeId = projeKaydet(vt, { ad: 'P' });
    T = ortamKaydet(vt, { projeId, ad: 'Deneme', tabanUrl: 'https://test.ornek.invalid', varsayilan: true, ayarlar: { riskli: false } });
    C = ortamKaydet(vt, { projeId, ad: 'Üretim', tabanUrl: 'https://canli.ornek.invalid', ayarlar: { riskli: true } });
  });

  test('servis sayfası / sihirbaz (REST): karar yoksa yazılmaz; ayır, vazgeç, tabanın adresini güncelle', async () => {
    const uc = [{ ad: 'liste', metot: 'GET', yol: '/liste' }];
    const a = restServisiKaydet(vt, projeId, { anahtar: 'ra', ad: 'RA', tabanlar: ortak(), uclar: uc }).id;
    const b = restServisiKaydet(vt, projeId, { anahtar: 'rb', ad: 'RB', tabanlar: ortak(), uclar: uc }).id;
    const c = restServisiKaydet(vt, projeId, { anahtar: 'rc', ad: 'RC', tabanlar: { [T]: 'https://api-test.ornek.invalid', [C]: '' }, uclar: uc }).id;
    tabanAdresiIslemi(vt, projeId, { islem: 'ekle', ad: 'Ortak', adresler: ortak(), baglanacaklar: [a, b], onay: true });
    tabanlariUygula(vt, projeId, { degisiklikler: { [c]: { grup: 'Ortak', tabanlar: { [T]: 'https://api-test.ornek.invalid', [C]: '' } } }, onay: true });
    const yeni = { [T]: 'https://api2-test.ornek.invalid', [C]: 'https://api.ornek.invalid' };

    // Karar yok: TabanKarariHatasi, hiçbir şey yazılmaz; hata pencere bilgisini ve "Tabanın adresini güncelle" etkisini taşır.
    const h = kararHatasi(() => servisiKaydet(vt, projeId, { id: a, anahtar: 'ra', ad: 'RA', yol: '/', tabanlar: yeni }));
    expect(h.message).toBe('"RA" "Ortak" taban adresine bağlı; yeni adres farklı (Deneme: https://api-test.ornek.invalid → https://api2-test.ornek.invalid).');
    expect(h.karar).toMatchObject({ servisId: a, servis: 'RA', taban: 'Ortak', cakismalar: [{ ortamId: T, ortam: 'Deneme', eski: 'https://api-test.ornek.invalid', yeni: 'https://api2-test.ornek.invalid' }] });
    expect(h.karar.etki.servisler.map((s) => s.ad).sort()).toEqual(['RA', 'RB', 'RC']);
    expect(ay(a)?.tabanlar?.[T]).toBe('https://api-test.ornek.invalid');
    // "Bu ortamda yok" servise özeldir: karar sorulmaz.
    servisiKaydet(vt, projeId, { id: b, anahtar: 'rb', ad: 'RB', yol: '/', tabanlar: { [T]: 'https://api-test.ornek.invalid', [C]: '' } });
    expect(ay(b)).toMatchObject({ tabanGrubu: 'Ortak', tabanlar: { [C]: '' } });
    servisiKaydet(vt, projeId, { id: b, anahtar: 'rb', ad: 'RB', yol: '/', tabanlar: ortak() });

    // Vazgeç: yeni adres kullanılmaz, servis tabandaki adreste kalır; diğer değişiklik (ad) yazılır.
    servisiKaydet(vt, projeId, { id: a, anahtar: 'ra', ad: 'RA yeni', yol: '/', tabanlar: yeni, tabanKararlari: { [a]: 'vazgec' } });
    expect(servisGetir(vt, a)?.ad).toBe('RA yeni');
    expect(ay(a)).toMatchObject({ tabanGrubu: 'Ortak', tabanlar: ortak() });

    // Ayır: yalnız bu servis yeni adresi kullanır, bağ kalkar; diğer bağlı servisler ve taban değişmez.
    servisiKaydet(vt, projeId, { id: a, anahtar: 'ra', ad: 'RA', yol: '/', tabanlar: yeni, tabanKararlari: { [a]: 'ayir' } });
    expect(ay(a)?.tabanGrubu).toBeUndefined();
    expect(ay(a)?.tabanlar).toEqual(yeni);
    expect(ay(b)?.tabanlar).toEqual(ortak());
    expect(tabanTablosu(vt, projeId).tabanAdlari.find((t) => t.ad === 'Ortak')?.adresler).toEqual(ortak());

    // Tabanın adresini güncelle (REST sihirbazı / uç kaydı): taban ve bağlı TÜM servisler değişir; servise özel "yok" korunur.
    expect(() => restServisiKaydet(vt, projeId, { id: b, anahtar: 'rb', ad: 'RB', tabanlar: yeni, uclar: uc })).toThrow(TabanKarariHatasi);
    restServisiKaydet(vt, projeId, { id: b, anahtar: 'rb', ad: 'RB', tabanlar: yeni, uclar: uc, tabanKararlari: { [b]: 'tabaniGuncelle' } });
    expect(tabanTablosu(vt, projeId).tabanAdlari.find((t) => t.ad === 'Ortak')?.adresler).toEqual(yeni);
    expect(ay(b)).toMatchObject({ tabanGrubu: 'Ortak', tabanlar: yeni });
    expect(ay(c)).toMatchObject({ tabanGrubu: 'Ortak', tabanlar: { [T]: yeni[T], [C]: '' } });
    // Aynı adres: karar sorulmaz.
    servisiKaydet(vt, projeId, { id: b, anahtar: 'rb', ad: 'RB', yol: '/', tabanlar: yeni });
  });

  test('Postman içe aktarma: köken farklıysa karar; önizlemede sorulmaz; Vazgeç diğer içeriği yine aktarır', async () => {
    const koleksiyon = JSON.stringify({
      info: { name: 'K', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
      item: [{ name: 'Stok', item: [{ name: 'Stok listesi', request: { method: 'GET', url: 'https://yeni-stok.ornek.invalid/stok/liste' } }] }]
    });
    const s = restServisiKaydet(vt, projeId, { anahtar: 'stok', ad: 'Stok', tabanlar: { [T]: 'https://stok-test.ornek.invalid' }, uclar: [{ ad: 'eski', metot: 'GET', yol: '/stok/eski' }] }).id;
    tabanAdresiIslemi(vt, projeId, { islem: 'ekle', ad: 'Stok sunucusu', adresler: { [T]: 'https://stok-test.ornek.invalid' }, baglanacaklar: [s], onay: true });
    const girdi = { koleksiyon, klasorler: ['stok'], tabanOrtami: T, tabloAdi: 'Stok değişkenleri' };
    // Etki hesabı (onizle) karar sormaz.
    expect(postmanAktar(vt, projeId, { ...girdi, etki: 'onizle' }).onizleme).toBe(true);
    const h = kararHatasi(() => postmanAktar(vt, projeId, girdi));
    expect(h.karar).toMatchObject({ servisId: s, taban: 'Stok sunucusu', cakismalar: [{ eski: 'https://stok-test.ornek.invalid', yeni: 'https://yeni-stok.ornek.invalid' }] });
    expect(servisGetir(vt, s)?.ayarlar.operasyonlar?.map((o) => o.ad)).toEqual(['eski']);
    postmanAktar(vt, projeId, { ...girdi, tabanKararlari: { [s]: 'vazgec' } });
    expect(ay(s)).toMatchObject({ tabanGrubu: 'Stok sunucusu', tabanlar: { [T]: 'https://stok-test.ornek.invalid' } });
    expect(servisGetir(vt, s)?.ayarlar.operasyonlar?.length).toBe(2);
  });
});
