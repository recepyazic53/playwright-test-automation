// Sol panel "ÜRÜNLER" bölümü (Sonuçlar, Senaryolar, Ekranlar ve Servisler sayfalarında aynı düzen): açılır-kapanır gruplar
//   ÜRÜNLER                 [+ Yeni]  → ekran mı servis mi, sorar
//   ▾ Ekranlar              [+]       → sayfanın kendi ekran listesi
//   ▾ Ortak akışlar / Alt modeller     (yalnız Ekranlar sayfasında)
//   ▾ Servisler             [+]       → servisler (bağlantının hedefi sayfaya göre)
import { api, h, ikon } from './ortak.js';
import { secenekIste } from './kosu-paneli.js';

/** Servis listesi; alınamazsa (ör. kasa kilitli, eski sunucu) boş. @param {{ id: string }} proje */
export async function servisleriAl(proje) {
  try { return (await api(`/platform/servisler?projeId=${encodeURIComponent(proje.id)}`)).servisler; } catch { return []; }
}

/** "ÜRÜNLER" başlığı ve grupların dışındaki "+ Yeni". */
export function urunlerBasligi() {
  return [h('div', { class: 'alt-nav-ust' }, h('div', { class: 'alt-nav-baslik', 'aria-hidden': 'true' }, 'Ürünler'), yeniEkleDugmesi())];
}

/** "Ekranlar" grubu. @param {Array<Node | null | false>} ogeler */
export function ekranlarGrubu(ogeler) {
  return navGrubu({ anahtar: 'ekranlar', baslik: 'Ekranlar', ogeler, bosMetin: 'Henüz ekran yok.', ekle: { etiket: 'Ekran ekle', href: '#/ekranlar/yeni' } });
}

const SAGLIK = { basarili: 'basari', basarisiz: 'hata', hata: 'hata' };

/**
 * "Servisler" grubu (açılır-kapanır; "+" servis ekler).
 * @param {Array<{ id: string; ad: string; durum: string; senaryoSayisi?: number; sonKosu?: { durum: string } | null }>} servisler
 * @param {{ seciliServis?: string | null; sekme?: string; adres?: (id: string) => string; saglik?: boolean }} [secenekler]
 *   sekme: servis bağlantısının açacağı servis sayfası sekmesi; adres: bağlantı adresi (verilirse sekme yerine; ör. Sonuçlar
 *   ekranında servisin süzülmüş sonuç görünümü); saglik: son çalıştırmanın durum noktası gösterilsin mi.
 */
export function servislerBolumu(servisler, secenekler = {}) {
  const baglanti = (s) => {
    const son = s.sonKosu ? SAGLIK[s.sonKosu.durum] ?? '' : '';
    const a = h('a', {
      href: secenekler.adres ? secenekler.adres(s.id) : `#/servisler/s/${encodeURIComponent(s.id)}${secenekler.sekme ? `/${secenekler.sekme}` : ''}`,
      'aria-current': secenekler.seciliServis === s.id ? 'page' : null,
      class: s.durum === 'devre_disi' ? 'devre-disi' : null
    },
    secenekler.saglik ? h('span', { class: `saglik ${son}`, 'aria-hidden': 'true' }) : ikon('ag'),
    h('span', { class: 'nav-metni' }, s.ad),
    s.durum === 'devre_disi' ? h('span', { class: 'nav-etiketi' }, 'kapalı') : null,
    s.senaryoSayisi ? h('span', { class: 'adet' }, String(s.senaryoSayisi)) : null,
    secenekler.saglik && s.sonKosu ? h('span', { class: 'gorunmez' }, ` — son çalıştırma: ${s.sonKosu.durum === 'basarili' ? 'başarılı' : 'başarısız'}`) : null);
    return a;
  };
  return [navGrubu({
    anahtar: 'servisler', baslik: 'Servisler', ogeler: servisler.map(baglanti), bosMetin: 'Henüz servis yok.',
    ekle: { etiket: 'Servis ekle', href: '#/servisler/yeni' }
  })];
}

/** "Uçtan uca akışlar" bağlantısı (servis + ekran + SQL adımlı akışlar; #/akislar). */
export function uctanUcaBaglantisi() {
  const secili = (location.hash || '').startsWith('#/akislar');
  return h('a', { href: '#/akislar', class: 'uctan-uca-baglantisi', 'aria-current': secili ? 'page' : null },
    ikon('katman'), h('span', { class: 'nav-metni' }, 'Uçtan uca akışlar'));
}

// ---------------------------------------------------------------------------------------
// Açılır-kapanır gruplar (Ekranlar, Ortak akışlar, Alt modeller, Servisler)
// ---------------------------------------------------------------------------------------
// Grubun açık/kapalı durumu bu tarayıcıda hatırlanır (yalnız görünüm kolaylığı; kasaya yazılmaz). Grubun başlığındaki "+"
// o gruba yeni öğe ekler; grupların dışındaki "+ Yeni" ne ekleneceğini sorar.

const GRUP_ANAHTARI = 'nobetci-yan-gruplar';
function kapaliGruplar() {
  try { return new Set(JSON.parse(localStorage.getItem(GRUP_ANAHTARI) || '[]')); } catch { return new Set(); }
}
function grupDurumunuYaz(anahtar, kapali) {
  try {
    const s = kapaliGruplar();
    if (kapali) s.add(anahtar); else s.delete(anahtar);
    localStorage.setItem(GRUP_ANAHTARI, JSON.stringify([...s]));
  } catch { /* depolama kapalı: yalnız bu oturumda */ }
}

let grupSayaci = 0;
/**
 * Yan panelde açılır-kapanır grup. Seçili öğe içeren grup kapalı kaydedilmiş olsa da açık gelir.
 * @param {{ anahtar: string; baslik: string; ikonAd?: string; ogeler: Array<Node | null | false>; ekle?: { etiket: string; href?: string; tikla?: () => void } | null; bosMetin?: string }} g
 */
export function navGrubu(g) {
  const ogeler = /** @type {Node[]} */ (g.ogeler.filter(Boolean));
  const elemanlar = ogeler.filter((o) => o instanceof Element);
  const seciliVar = elemanlar.some((o) => o.getAttribute('aria-current') === 'page' || !!o.querySelector('[aria-current="page"]'));
  let acik = seciliVar || !kapaliGruplar().has(g.anahtar);
  const icerikId = `nav-grup-${++grupSayaci}`;
  const icerik = h('div', { class: 'nav-grup-icerik', id: icerikId, role: 'group', 'aria-label': g.baslik, hidden: !acik },
    ogeler.length ? ogeler : h('p', { class: 'nav-grup-bos' }, g.bosMetin || 'Henüz yok.'));
  const adet = elemanlar.filter((o) => o.tagName === 'A' && !o.classList.contains('ekle-baglantisi')).length;
  const acKapat = h('button', { type: 'button', class: 'nav-grup-baslik', 'aria-expanded': String(acik), 'aria-controls': icerikId },
    h('span', { class: 'nav-grup-ok', 'aria-hidden': 'true' }, ikon('asagi')),
    h('span', { class: 'nav-metni' }, g.baslik),
    h('span', { class: 'adet' }, String(adet)));
  const grup = h('div', { class: `nav-grup${acik ? '' : ' kapali'}`, 'data-grup': g.anahtar });
  acKapat.addEventListener('click', () => {
    acik = !acik;
    icerik.hidden = !acik;
    grup.classList.toggle('kapali', !acik);
    acKapat.setAttribute('aria-expanded', String(acik));
    grupDurumunuYaz(g.anahtar, !acik);
  });
  let ekle = null;
  if (g.ekle) {
    const ozellik = { class: 'ikon-dugme hayalet nav-grup-ekle', title: g.ekle.etiket, 'aria-label': g.ekle.etiket };
    ekle = g.ekle.href ? h('a', { ...ozellik, href: g.ekle.href }, ikon('arti')) : h('button', { ...ozellik, type: 'button', onclick: g.ekle.tikla }, ikon('arti'));
  }
  grup.append(h('div', { class: 'nav-grup-ust' }, acKapat, ekle), icerik);
  return grup;
}

/** Grupların dışındaki "+ Yeni": ekran mı servis mi eklenecek, sorar. */
export function yeniEkleDugmesi() {
  return h('button', {
    type: 'button', class: 'nav-yeni-ekle',
    onclick: async () => {
      const secim = await secenekIste({
        baslik: 'Ne eklemek istiyorsunuz?', ikonAd: 'arti',
        secenekler: [
          { deger: 'ekran', etiket: 'Ekran', aciklama: 'Test edilecek bir sayfa: ekran paketi, tarama ya da akış kaydıyla. Ortak akışlar da buradan (paket) eklenir.', ikonAd: 'ekran' },
          { deger: 'servis', etiket: 'Servis', aciklama: 'SOAP / REST servis: WSDL, SoapUI projesi, Postman koleksiyonu, cURL ya da elle.', ikonAd: 'ag' }
        ]
      });
      if (secim === 'ekran') location.hash = '#/ekranlar/yeni';
      else if (secim === 'servis') location.hash = '#/servisler/yeni';
    }
  }, ikon('arti'), 'Yeni');
}
