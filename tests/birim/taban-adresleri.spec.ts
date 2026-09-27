// KORUMA TESTLERİ — servis taban adreslerinin toplu düzenlenmesi (scripts/platform/servisler/taban-adresleri.mjs): etki önizlemesi
// onaysız hiçbir şey yazmaz; adlandırılmış taban adresteki servisler aynı kalmalı; http(s) ve yasak adres denetimi; eski tam adres
// ayarı düzenlenen hücrede kalkar. Geçici klasör; ağ isteği YOK.
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import type { Veritabani } from '../../scripts/platform/veritabani/baglanti.mjs';
import { ortamKaydet, projeKaydet, veritabaniniHazirla } from '../../scripts/platform/veritabani/depo.mjs';
import { servisGetir, servisKaydet, servisSenaryosuKaydet } from '../../scripts/platform/servisler/servis-deposu.mjs';
import { tabanlariUygula, tabanTablosu } from '../../scripts/platform/servisler/taban-adresleri.mjs';
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
  });
});
