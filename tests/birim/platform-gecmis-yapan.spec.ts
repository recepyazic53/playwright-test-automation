// KORUMA TESTLERİ — değişiklik geçmişindeki "yapan" alanı düz metin makine adı İÇERMEZ:
// "kullanici@<makineId>" yazılır; eski kayıtlar göç 3 ile, eski yedekler içe aktarmada
// aynı biçime çevrilir. Tarayıcı AÇMAZ; geçici klasörde / bellekte çalışır.
import { readFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { veritabaniAc } from '../../scripts/platform/veritabani/baglanti.mjs';
import { GUNCEL_SEMA_SURUMU, gocleriUygula, mevcutSemaSurumu } from '../../scripts/platform/veritabani/gocler.mjs';
import {
  degisiklikGecmisiListele, gecmisYapaniniNormallestir, girisProfiliKaydet, projeKaydet, veritabaniniHazirla
} from '../../scripts/platform/veritabani/depo.mjs';
import { kasaOlustur } from '../../scripts/platform/kasa.mjs';
import { HIZLI_KDF, geciciKlasor } from './platform-ortak';

const PAROLA = 'Gecmis-Parola-123';

test.describe('Değişiklik geçmişi — yapan alanı', () => {
  test('yeni kayıt "kullanici@<makineId>" yazar; makine adı düz metin olarak geçmez', async () => {
    const klasor = geciciKlasor('yapan');
    try {
      const yol = join(klasor.yol, 'platform.db');
      const vt = await veritabaniniHazirla(yol);
      await kasaOlustur(vt, PAROLA, { kdf: HIZLI_KDF });
      const proje = projeKaydet(vt, { ad: 'Proje' });
      const profil = girisProfiliKaydet(vt, { projeId: proje, ad: 'Profil', kullaniciAdi: 'kullanici1', parola: 'gizli-123' });
      const makineId = String(vt.metaOku('yerel_makine_id'));
      const [kayit] = degisiklikGecmisiListele(vt, 'giris_profili', profil);
      expect(kayit.yapan.endsWith(`@${makineId}`)).toBe(true);
      expect(kayit.makineId).toBe(makineId);
      const makineAdi = hostname();
      expect(kayit.yapan.includes(makineAdi)).toBe(false);
      vt.kapat();
      // Makine adı veritabanı dosyasında düz metin olarak hiç geçmez (makineler.ad şifreli).
      if (makineAdi.length >= 4) expect(readFileSync(yol).includes(Buffer.from(makineAdi))).toBe(false);
    } finally {
      klasor.temizle();
    }
  });

  test('göç 3: eski "kullanici@makine-adi" kayıtları makine kimliğine çevrilir; diğerlerine dokunulmaz', async () => {
    const vt = await veritabaniAc(null);
    gocleriUygula(vt, { hedefSurum: 2 });
    const z = '2026-01-01T00:00:00.000Z';
    const ekle = (id: string, yapan: string, makineId: string | null) => vt.calistir(
      `INSERT INTO degisiklik_gecmisi (id, varlik_turu, varlik_id, islem, yapan, makine_id, zaman) VALUES (?, 'senaryo', 's1', 'guncelle', ?, ?, ?)`,
      [id, yapan, makineId, z]
    );
    ekle('h1', 'ayse@AYSE-DIZUSTU-7731', 'm-1');
    ekle('h2', 'ayse@AYSE-DIZUSTU-7731', null);
    ekle('h3', 'ice-aktarma:m-9', 'm-1');
    ekle('h4', 'birim', 'm-1');
    ekle('h5', 'ayse@m-1', 'm-1');
    const sonuc = gocleriUygula(vt);
    expect(sonuc.uygulananlar).toContain(3);
    expect(mevcutSemaSurumu(vt)).toBe(GUNCEL_SEMA_SURUMU);
    const yapanlar = Object.fromEntries(vt.tumu('SELECT id, yapan FROM degisiklik_gecmisi').map((s) => [String(s.id), String(s.yapan)]));
    expect(yapanlar).toEqual({
      h1: 'ayse@m-1', h2: 'ayse@bilinmeyen-makine', h3: 'ice-aktarma:m-9', h4: 'birim', h5: 'ayse@m-1'
    });
    expect(JSON.stringify(yapanlar).includes('DIZUSTU')).toBe(false);
    vt.kapat();
  });

  test('gecmisYapaniniNormallestir: göç ile aynı kural, değişiklik yoksa aynı nesne', () => {
    const satir = { id: 'x', yapan: 'ali@ALI-PC', makine_id: 'm-2' };
    expect(gecmisYapaniniNormallestir(satir)).toEqual({ id: 'x', yapan: 'ali@m-2', makine_id: 'm-2' });
    const ayni = { id: 'y', yapan: 'ali@m-2', makine_id: 'm-2' };
    expect(gecmisYapaniniNormallestir(ayni)).toBe(ayni);
    const iceAktarma = { id: 'z', yapan: 'ice-aktarma:m-3', makine_id: null };
    expect(gecmisYapaniniNormallestir(iceAktarma)).toBe(iceAktarma);
  });
});
