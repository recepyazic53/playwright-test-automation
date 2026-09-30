// HEDEF SAYFA AÇMA (tarama / öğe seçme / akış kaydı / hızlı test ortak: tarama-motoru.ts > hedefSayfayiAc) — "net::ERR_ABORTED" bir
// erişilemezlik değil, gezinmenin tamamlanmadan kesilmesidir. Hata iletisi sunucunun GERÇEK yanıtını söylemeli (boş 204 yanıtı, dosya indirme),
// normal sayfa etkilenmemeli. Güvenlik: yalnızca 127.0.0.1'deki sahte sunucu (DNS kapalı); adresler iletide gizlenir.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { TaramaHatasi, hedefSayfayiAc } from '../../scripts/platform/tarama/tarama-motoru';
import { korumaliTarayici, yerelSunucu, type FiksturIstegi, type FiksturYaniti } from './giris-fikstur';

let sunucu: Awaited<ReturnType<typeof yerelSunucu>>;
let tarayici: Browser;
let page: Page;
test.beforeAll(async () => {
  sunucu = await yerelSunucu((i: FiksturIstegi): FiksturYaniti => {
    switch (i.yol) {
      case '/bos': return { durum: 204, tur: 'text/plain', govde: '' };
      case '/yonlen-bos': return { durum: 302, tur: 'text/plain', govde: '', basliklar: { location: '/bos' } };
      case '/indir': return { tur: 'application/octet-stream', govde: 'x', basliklar: { 'content-disposition': 'attachment; filename=a.bin' } };
      case '/yonlen': return { durum: 302, tur: 'text/plain', govde: '', basliklar: { location: '/tamam' } };
      default: return { tur: 'text/html; charset=utf-8', govde: '<!doctype html><title>Sayfa</title><p>tamam</p>' };
    }
  });
  tarayici = await korumaliTarayici();
});
test.afterAll(async () => { await tarayici?.close(); await sunucu?.kapat(); });
test.beforeEach(async () => { page = await (await tarayici.newContext()).newPage(); });
test.afterEach(async () => { await page.context().close(); });

const ac = (yol: string) => hedefSayfayiAc(page, `${sunucu.adres}${yol}`, 8_000, yol);
const hata = async (yol: string): Promise<TaramaHatasi> => {
  const h = await ac(yol).then(() => null, (e: unknown) => e);
  expect(h, `${yol} hata vermeliydi`).toBeInstanceOf(TaramaHatasi);
  return h as TaramaHatasi;
};

test('normal sayfa ve yönlendirme: açılır, hata yok', async () => {
  expect(await ac('/tamam')).toBeNull();
  expect(await ac('/yonlen')).toBeNull();
  expect(page.url()).toContain('/tamam');
});

test('boş yanıt (HTTP 204): ERR_ABORTED erişilemezlik sayılmaz; iletide sunucunun gerçek yanıtı ve olası nedenler yazar', async () => {
  const h = await hata('/bos');
  expect(h.kod).toBe('SITE_ERISILEMEDI');
  expect(h.message).toMatch(/gezinmeyi iptal etti \(net::ERR_ABORTED; HTTP 204, boş yanıt\)/);
  expect(h.message).toMatch(/adres yanlış olabilir|dosya indirmesi/);
  expect(h.message).not.toMatch(/https?:\/\//);
});

test('yönlendirme boş yanıta çıkıyorsa da açık ileti', async () => {
  const h = await hata('/yonlen-bos');
  expect(h.message).toMatch(/net::ERR_ABORTED; HTTP 204, boş yanıt/);
});

test('dosya indirmesi: sayfa değil, açık Türkçe ileti', async () => {
  const h = await hata('/indir');
  expect(h.kod).toBe('SITE_ERISILEMEDI');
  expect(h.message).toMatch(/dosya indirmesi başlatıyor/);
});
