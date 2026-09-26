// KORUMA TESTLERİ — canlı koşu panelinde adım listesi: raporlayıcı üst düzey test.step'leri başladıkça / bittikçe koşuya özel
// dosyaya yazar (TEST_SUNUCU_ADIM_YOLU); iç içe adımlar ve Playwright gürültüsü (Fill, Expect…) yazılmaz; hata veren adım
// "basarisiz". Panel bu dosyayı /adim-durumu ucundan okur (uçtan uca: model-kosucu-uctan-uca > arayüz testi).
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import PlatformRaporlayici from '../../scripts/platform/raporlayici.mjs';

type Adim = { ad: string; durum: string; sureMs?: number };
type CanliRaporlayici = {
  onTestBegin: (t: unknown, r: unknown) => void;
  onStepBegin: (t: unknown, r: unknown, a: Record<string, unknown>) => void;
  onStepEnd: (t: unknown, r: unknown, a: Record<string, unknown>) => void;
};

test('raporlayıcı canlı adımları dosyaya yazar: çalışıyor → başarılı / başarısız; iç içe ve gürültü adımları yok', () => {
  const klasor = mkdtempSync(join(tmpdir(), 'canli-adim-'));
  const yol = join(klasor, 'adimlar.json');
  const onceki = process.env.TEST_SUNUCU_ADIM_YOLU;
  process.env.TEST_SUNUCU_ADIM_YOLU = yol;
  try {
    const r = new PlatformRaporlayici() as unknown as CanliRaporlayici;
    const oku = () => (JSON.parse(readFileSync(yol, 'utf-8')) as { adimlar: Adim[] }).adimlar;
    r.onTestBegin({}, {});
    expect(oku()).toEqual([]);
    const giris = { category: 'test.step', title: 'Sisteme giriş yapılır' };
    r.onStepBegin({}, {}, giris);
    expect(oku()).toEqual([expect.objectContaining({ ad: 'Sisteme giriş yapılır', durum: 'calisiyor' })]);
    // İç içe adım ve gürültü yazılmaz.
    r.onStepBegin({}, {}, { category: 'test.step', title: 'İç adım', parent: giris });
    r.onStepBegin({}, {}, { category: 'test.step', title: 'Fill "x"' });
    r.onStepBegin({}, {}, { category: 'pw:api', title: 'locator.click' });
    expect(oku()).toHaveLength(1);
    r.onStepEnd({}, {}, { ...giris, duration: 410 });
    const prim = { category: 'test.step', title: 'Prim hesaplanır' };
    r.onStepBegin({}, {}, prim);
    r.onStepEnd({}, {}, { ...prim, duration: 1100, error: { message: 'beklenen sonuç doğrulanamadı' } });
    expect(oku().map((a) => [a.ad, a.durum, a.sureMs])).toEqual([['Sisteme giriş yapılır', 'basarili', 410], ['Prim hesaplanır', 'basarisiz', 1100]]);
    // Yeni test (yeniden deneme) listeyi sıfırlar.
    r.onTestBegin({}, {});
    expect(oku()).toEqual([]);
  } finally {
    if (onceki === undefined) delete process.env.TEST_SUNUCU_ADIM_YOLU; else process.env.TEST_SUNUCU_ADIM_YOLU = onceki;
    rmSync(klasor, { recursive: true, force: true });
  }
});
