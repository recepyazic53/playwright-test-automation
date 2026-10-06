// KORUMA — sayfanın kendi açılır penceresi (POST ile yüklenen çerçeve / iframe) ve yazma isteği engeli:
// "Bu sayfa Chromium tarafından engellendi" (ERR_BLOCKED_BY_CLIENT) pencerede görünür ve kullanıcı değiştirilemezse neden, Nöbetçi'nin kendi
// yazma isteği engelidir (koruma.mjs > istekKarari). Engel yalnız OKUMA aşamalarında (tarama, öğe seçme, hızlı test) vardır; giriş, bağlam değiştirme
// ve KAYIT aşamalarında yazma serbesttir. Asıl hata bir YARIŞTI: bağlam değiştirmenin son tıklaması pencerenin form gönderimini başlatırken
// aşama hemen okuma kipine geçiyor, gecikmeli gelen POST engelleniyordu. Bağlam değiştirme sonrası isteklerin bitmesi beklenir (tarama-girisi.ts >
// isteklerBitsin). Testler kendi bağlamında motorların kullandığı karar fonksiyonunu birebir uygular.
// Güvenlik: yalnızca 127.0.0.1'deki sahte uygulama (DNS kapalı); değerler SAHTEDİR.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { istekKarari } from '../../scripts/platform/tarama/koruma.mjs';
import { isteklerBitsin } from '../../scripts/platform/tarama/tarama-girisi';
import { korumaliTarayici, yerelSunucu, type FiksturIstegi, type FiksturYaniti } from './giris-fikstur';

type Asama = Parameters<typeof istekKarari>[0]['asama'];

const html = (baslik: string, govde: string): FiksturYaniti => ({
  tur: 'text/html; charset=utf-8',
  govde: `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${baslik}</title></head><body>${govde}</body></html>`
});

/** Ana sayfa: "Kullanıcı değiştir" düğmesi 250 ms sonra bir pencere (çerçeve) açar; çerçevenin içeriği POST ile yüklenir. */
const uygulama = (i: FiksturIstegi): FiksturYaniti => {
  if (i.yol === '/') {
    return html('Ana sayfa', `<button id="ac" type="button">Kullanıcı değiştir</button>
<form id="pf" method="post" action="/pencere" target="modal" hidden></form>
<script>document.getElementById('ac').addEventListener('click', () => setTimeout(() => {
  const f = document.createElement('iframe'); f.id = 'modal'; f.name = 'modal'; f.style.cssText = 'width:400px;height:120px';
  document.body.append(f); document.getElementById('pf').submit();
}, 250));</script>`);
  }
  if (i.yol === '/pencere' && i.yontem === 'POST') return html('Pencere', '<p>Pencere içeriği</p>');
  return { durum: 404, tur: 'text/plain', govde: 'yok' };
};

let tarayici: Browser;
let sunucu: Awaited<ReturnType<typeof yerelSunucu>>;

test.beforeAll(async () => {
  sunucu = await yerelSunucu(uygulama);
  tarayici = await korumaliTarayici();
});
test.afterAll(async () => {
  await tarayici?.close();
  await sunucu?.kapat();
});

/** Motorlardaki gibi: her istek aşamaya göre karara bağlanır; engellenen istek iptal edilir ("blockedbyclient"). */
async function sayfaAc(durum: { asama: Asama }): Promise<{ page: Page; engellenen: string[]; kapat: () => Promise<void> }> {
  const baglam = await tarayici.newContext({ baseURL: sunucu.adres });
  const engellenen: string[] = [];
  await baglam.route('**/*', async (route) => {
    const r = route.request();
    const karar = istekKarari({ yontem: r.method(), adres: r.url(), asama: durum.asama, yasakDesenleri: [], izinliKokenler: null });
    if (karar.izin) { await route.fallback(); return; }
    engellenen.push(`${r.method()} ${new URL(r.url()).pathname} (${karar.neden})`);
    await route.abort('blockedbyclient');
  });
  const page = await baglam.newPage();
  await page.goto('/');
  return { page, engellenen, kapat: () => baglam.close() };
}

for (const asama of ['giris', 'baglam', 'kayit', 'secme'] as const) {
  test(`${asama} aşamasında sayfanın açılır penceresi (POST ile yüklenen çerçeve) engellenmez`, async () => {
    const { page, engellenen, kapat } = await sayfaAc({ asama });
    await page.getByRole('button', { name: 'Kullanıcı değiştir' }).click();
    await expect(page.frameLocator('#modal').getByText('Pencere içeriği')).toBeVisible();
    expect(engellenen).toEqual([]);
    await kapat();
  });
}

for (const asama of ['tarama'] as const) {
  test(`${asama} (okuma) aşamasında yazma isteği engellenir: çerçevenin POST'u iptal edilir (tasarım gereği)`, async () => {
    const { page, engellenen, kapat } = await sayfaAc({ asama });
    await page.getByRole('button', { name: 'Kullanıcı değiştir' }).click();
    await expect.poll(() => engellenen).toEqual(['POST /pencere (yazma)']);
    await expect(page.frameLocator('#modal').getByText('Pencere içeriği')).toHaveCount(0);
    await kapat();
  });
}

test('yarış: bağlam değiştirmenin son tıklamasından hemen sonra okuma kipine geçilirse gecikmeli POST engellenir; isteklerBitsin ile engellenmez', async () => {
  // Eski davranış: tıklama döner dönmez aşama okuma kipine geçer; 250 ms sonra gelen POST engellenir (pencerede "engellendi").
  const eski: { asama: Asama } = { asama: 'baglam' };
  const a = await sayfaAc(eski);
  await a.page.getByRole('button', { name: 'Kullanıcı değiştir' }).click();
  eski.asama = 'tarama';
  await expect.poll(() => a.engellenen).toEqual(['POST /pencere (yazma)']);
  await a.kapat();

  // Düzeltme: okuma kipine geçmeden önce sayfanın istekleri bitene kadar beklenir.
  const yeni: { asama: Asama } = { asama: 'baglam' };
  const b = await sayfaAc(yeni);
  await b.page.getByRole('button', { name: 'Kullanıcı değiştir' }).click();
  await isteklerBitsin(b.page);
  yeni.asama = 'tarama';
  await expect(b.page.frameLocator('#modal').getByText('Pencere içeriği')).toBeVisible();
  expect(b.engellenen).toEqual([]);
  await b.kapat();
});
