// YÜKLENME PERDESİ (genel): düğmeyi sayfanın kendi kendine kalkan yüklenme perdesi örtüyorsa (geniş örtü, içinde etkileşimli denetim
// yok; yalnız dönen gösterge / kısa bekleme yazısı) Escape'e basılmadan ve boş yere tıklanmadan kalkması beklenir, sonra basılır. Hiç
// kalkmayan perdede beklendiğini söyleyen açık hata; içinde düğme olan gerçek pencerede eski davranış (Escape → boş yer → açık hata).
// Hızlı test (ortuyuKaldir + guvenliTikla) ve normal koşu (guvenliTikla) aynı ortak yolu kullanır.
// Güvenlik: yalnız setContent (ağ yok).
import { expect, test, type Page } from '@playwright/test';
import { guvenliTikla, ortuyuKaldir } from '../../scripts/platform/tarama/guvenli-tiklama';
import { korumaliTarayici } from './giris-fikstur';

const SAYFA = (perde: string, kalkmaMs: number | null): string => `<style>
  @keyframes don { to { transform: rotate(360deg); } }
  .perde { position: fixed; inset: 0; background: rgba(255,255,255,0.4); display: flex; align-items: center; justify-content: center; }
  .gosterge { width: 32px; height: 32px; border: 4px solid #999; border-top-color: transparent; border-radius: 50%; animation: don 0.8s linear infinite; }
</style>
<button id="once" style="margin:20px">Hesapla</button>
<button id="hedef" style="position:absolute;top:120px;left:40px;width:160px;height:40px">Teklif Al</button>
<p id="sayac">0</p>
<script>
  window.escSayisi = 0;
  document.addEventListener('keydown', (o) => { if (o.key === 'Escape') window.escSayisi++; });
  window.basis = 0; document.getElementById('hedef').onclick = () => { window.basis++; document.getElementById('sayac').textContent = 'Basıldı: ' + window.basis; };
  document.getElementById('once').onclick = () => {
    const p = document.createElement('div'); p.className = 'perde'; p.innerHTML = ${JSON.stringify(perde)}; document.body.appendChild(p);
    ${kalkmaMs === null ? '' : `setTimeout(() => p.remove(), ${kalkmaMs});`}
  };
</script>`;

const esc = (page: Page): Promise<number> => page.evaluate(() => (window as unknown as { escSayisi: number }).escSayisi);

test('kalkan perde (dönen gösterge, şeffaf): hızlı test yolu ve normal koşu yolu Escape göndermeden bekler, sonra basar', async () => {
  const tarayici = await korumaliTarayici();
  try {
    const page = await tarayici.newPage();
    // Hızlı test yolu: ortuyuKaldir (perde beklenir) → guvenliTikla.
    await page.setContent(SAYFA('<div class="gosterge"></div>', 2_000));
    await page.locator('#once').click();
    await expect(page.locator('.perde')).toBeVisible();
    const hedef = page.locator('#hedef');
    const bas = Date.now();
    await ortuyuKaldir(page, hedef, 'Teklif Al', { enCokMs: 10_000 });
    expect(Date.now() - bas).toBeGreaterThanOrEqual(1_000);
    await guvenliTikla(page, hedef, { zamanMs: 10_000, ad: 'Teklif Al', sakinlik: false });
    await expect(page.locator('#sayac')).toHaveText('Basıldı: 1');
    expect(await esc(page)).toBe(0);
    // Normal koşu yolu: yalnız guvenliTikla (perde kendi içinde beklenir); "Yükleniyor…" yazılı perde.
    await page.setContent(SAYFA('<div class="gosterge"></div><span>Yükleniyor…</span>', 2_000));
    await page.locator('#once').click();
    await guvenliTikla(page, page.locator('#hedef'), { zamanMs: 10_000, ad: 'Teklif Al' });
    await expect(page.locator('#sayac')).toHaveText('Basıldı: 1');
    await expect(page.locator('.perde')).toHaveCount(0);
    expect(await esc(page)).toBe(0);
  } finally { await tarayici.close(); }
});

test('hiç kalkmayan perde: beklendiğini söyleyen açık hata (Escape yok); normal koşu yolunda da aynı ileti', async () => {
  const tarayici = await korumaliTarayici();
  try {
    const page = await tarayici.newPage();
    await page.setContent(SAYFA('<div class="gosterge"></div><span>Lütfen bekleyiniz</span>', null));
    await page.locator('#once').click();
    await expect(ortuyuKaldir(page, page.locator('#hedef'), 'Teklif Al', { enCokMs: 2_000 }))
      .rejects.toThrow(/“Teklif Al” düğmesine basılamadı: sayfayı örten yüklenme perdesi \(.*\) 2 sn beklendi, kalkmadı/);
    await expect(guvenliTikla(page, page.locator('#hedef'), { zamanMs: 2_000, ad: 'Teklif Al', sakinlik: false }))
      .rejects.toThrow(/yüklenme perdesi .* 2 sn beklendi, kalkmadı/);
    await expect(page.locator('#sayac')).toHaveText('0');
    expect(await esc(page)).toBe(0);
  } finally { await tarayici.close(); }
});

test('içinde düğmesi olan gerçek pencere: perde sayılmaz; eski davranış (Escape → boş yer → açık hata)', async () => {
  const tarayici = await korumaliTarayici();
  try {
    const page = await tarayici.newPage();
    await page.setContent(SAYFA('<div role="dialog" style="background:#fff;padding:20px"><p>Devam etmek istiyor musunuz?</p><button>Kapat</button></div>', null));
    await page.locator('#once').click();
    const bas = Date.now();
    await expect(ortuyuKaldir(page, page.locator('#hedef'), 'Teklif Al', { enCokMs: 20_000 }))
      .rejects.toThrow(/“Teklif Al” düğmesine basılamadı: başka bir öğe düğmeyi örtüyor \(.*\)\. Escape ve sayfanın boş bir yerine tıklama denendi, kapanmadı/);
    // Perde gibi beklenmedi (süre dolmadan, hemen eski yola geçildi).
    expect(Date.now() - bas).toBeLessThan(10_000);
    expect(await esc(page)).toBe(1);
  } finally { await tarayici.close(); }
});
