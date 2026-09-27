// "OLUŞTUR" MENÜSÜ (üst çubukta, Ayarlar'ın yanında): Nöbetçi'de oluşturulabilecek her şeyin listesi; seçim ilgili ekrana
// götürür. Bir üst öğe gerektirenlerde (ekran senaryosu → hangi ekran, servis akışı → hangi servis) önce o sorulur.
// Klavye: ↑ / ↓ gezinir, Enter seçer, Esc kapatır. Yalnız yönlendirir; hiçbir şeyi kendiliğinden oluşturmaz.
import { api, h, ikon } from './ortak.js';
import { secenekIste } from './kosu-paneli.js';

/**
 * @typedef {{ baslik: string; aciklama: string; ikonAd: string; git: (proje: { id: string }) => Promise<string | null> | string | null }} Oge
 */

/** Ekran seçtirir (senaryo oluşturmak için). @param {{ id: string }} proje */
async function ekranSec(proje) {
  const { ekranlar = [] } = await api(`/platform/ekranlar?projeId=${encodeURIComponent(proje.id)}`).catch(() => ({ ekranlar: [] }));
  const adaylar = ekranlar.filter((e) => e.modelTuru !== 'altModel' && e.modelTuru !== 'ortakAkis' && e.durum !== 'devre_disi' && e.modelSurumu);
  if (!adaylar.length) return '#/ekranlar/yeni';
  const secim = await secenekIste({
    baslik: 'Hangi ekranda senaryo oluşturulsun?', ikonAd: 'liste',
    secenekler: adaylar.map((e) => ({ deger: e.id, etiket: e.ad, aciklama: `model v${e.modelSurumu}`, ikonAd: 'ekran' }))
  });
  return secim ? `#/senaryolar/yeni/${encodeURIComponent(secim)}` : null;
}

/** Servis seçtirir. @param {{ id: string }} proje @param {string} baslik @param {(id: string) => string} hedef */
async function servisSec(proje, baslik, hedef) {
  const { servisler = [] } = await api(`/platform/servisler?projeId=${encodeURIComponent(proje.id)}`).catch(() => ({ servisler: [] }));
  if (!servisler.length) return '#/servisler/yeni';
  const secim = await secenekIste({
    baslik, ikonAd: 'ag',
    secenekler: servisler.map((s) => ({ deger: s.id, etiket: s.ad, aciklama: s.senaryoSayisi ? `${s.senaryoSayisi} senaryo` : 'henüz senaryo yok', ikonAd: 'ag' }))
  });
  return secim ? hedef(secim) : null;
}

/**
 * Menü grupları. Ayarlar bölümleri yalnızca mevcutsa eklenir (ör. Entegrasyonlar, Taban adresler).
 * @param {Array<{ ad: string; etiket: string; ikon: string }>} ayarBolumleri
 * @returns {Array<{ grup: string; ogeler: Oge[] }>}
 */
function gruplar(ayarBolumleri) {
  const ayar = (ad, baslik, aciklama, ikonAd) => (ayarBolumleri.some((b) => b.ad === ad) ? [{ baslik, aciklama, ikonAd, git: () => `#/ayarlar/${ad}` }] : []);
  return [
    {
      grup: 'Ekran testleri',
      ogeler: [
        { baslik: 'Senaryo', aciklama: 'Bir ekranda yeni test durumu', ikonAd: 'liste', git: ekranSec },
        { baslik: 'Ekran (sayfa paketi)', aciklama: 'Claude Code\'un ürettiği paketi yükle', ikonAd: 'ekran', git: () => '#/ekranlar/yeni' },
        { baslik: 'Ekranı tara', aciklama: 'Nöbetçi sayfayı kendisi okusun', ikonAd: 'ara', git: () => '#/ekranlar/yeni/tara' },
        { baslik: 'Akış kaydı', aciklama: 'İşlemi siz yapın, Nöbetçi adımları kaydetsin', ikonAd: 'video', git: () => '#/ekranlar/yeni' },
        { baslik: 'Ortak akış', aciklama: 'Birden çok ekranın kullandığı adımlar (ör. ödeme)', ikonAd: 'pusula', git: () => '#/ekranlar/yeni' }
      ]
    },
    {
      grup: 'Servis testleri',
      ogeler: [
        { baslik: 'Servis', aciklama: 'WSDL, SoapUI projesi, Postman koleksiyonu ya da elle', ikonAd: 'ag', git: () => '#/servisler/yeni' },
        { baslik: 'Servis senaryosu', aciklama: 'Bir servise istek + kontroller', ikonAd: 'duzenle', git: (p) => servisSec(p, 'Hangi serviste senaryo oluşturulsun?', (id) => `#/servisler/s/${encodeURIComponent(id)}/senaryolar`) },
        { baslik: 'Servis akışı', aciklama: 'İstekleri zincirle (yanıttan değer taşı)', ikonAd: 'katman', git: (p) => servisSec(p, 'Hangi serviste akış oluşturulsun?', (id) => `#/servisler/s/${encodeURIComponent(id)}/akislar/yeni`) }
      ]
    },
    {
      grup: 'Veri ve ayarlar',
      ogeler: [
        { baslik: 'Test verisi', aciklama: 'Tablo, kayıt ya da değer listesi', ikonAd: 'veri', git: () => '#/ayarlar/test-verisi' },
        { baslik: 'Ortam', aciklama: 'Test, hazırlık, canlı… adresleri', ikonAd: 'ag', git: () => '#/ayarlar/proje' },
        { baslik: 'Giriş profili / tarifi', aciklama: 'Testlerin gireceği kullanıcı ve giriş adımları', ikonAd: 'anahtar', git: () => '#/ayarlar/giris' },
        { baslik: 'Servis taban adresi', aciklama: 'Servislerin ortam adresleri (toplu düzenleme)', ikonAd: 'ag', git: () => '#/ayarlar/proje' },
        ...ayar('entegrasyonlar', 'Entegrasyon', 'Bildirim, hata kaydı, veritabanı bağlantısı', 'simsek'),
        { baslik: 'Hata sınıflandırma kuralı', aciklama: 'Hata mesajı → kategori', ikonAd: 'uyari', git: () => '#/ayarlar/kosu' }
      ]
    }
  ];
}

/**
 * Üst çubuktaki "Oluştur" düğmesi + açılır menü.
 * @param {() => { proje: { id: string } | null; ayarBolumleri: Array<{ ad: string; etiket: string; ikon: string }>; yeniProje: () => void }} baglamAl
 */
export function olusturMenusu(baglamAl) {
  const menuId = 'olustur-menusu';
  const dugme = h('button', { type: 'button', class: 'olustur-dugmesi', 'aria-label': 'Oluştur menüsü', title: 'Yeni bir şey oluştur', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': menuId },
    ikon('arti'), h('span', { class: 'dugme-metni' }, 'Oluştur'), ikon('asagi'));
  const menu = h('div', { class: 'acilir-menu olustur-menusu', id: menuId, role: 'menu', hidden: true, 'aria-label': 'Oluştur' });
  const kap = h('div', { class: 'olustur-kap' }, dugme, menu);
  const kapat = (odakla = false) => { menu.hidden = true; dugme.setAttribute('aria-expanded', 'false'); if (odakla) dugme.focus(); };
  const ac = () => {
    const b = baglamAl();
    const bolumler = gruplar(b.ayarBolumleri);
    const oge = (o) => h('button', {
      type: 'button', role: 'menuitem', class: 'olustur-ogesi',
      onclick: async () => {
        kapat();
        if (!b.proje) return;
        const hedef = await o.git(b.proje);
        if (hedef) location.hash = hedef;
      }
    }, h('span', { class: 'olustur-ikon', 'aria-hidden': 'true' }, ikon(o.ikonAd)), h('span', { class: 'olustur-metin' }, h('b', {}, o.baslik), h('small', {}, o.aciklama)));
    menu.replaceChildren(
      h('div', { class: 'olustur-izgara' }, bolumler.map((g) => h('div', { class: 'olustur-grubu', role: 'group', 'aria-label': g.grup },
        h('div', { class: 'menu-baslik', 'aria-hidden': 'true' }, g.grup), g.ogeler.map(oge)))),
      h('hr', {}),
      h('button', { type: 'button', role: 'menuitem', class: 'olustur-ogesi', onclick: () => { kapat(); b.yeniProje(); } },
        h('span', { class: 'olustur-ikon', 'aria-hidden': 'true' }, ikon('artiYalin')), h('span', { class: 'olustur-metin' }, h('b', {}, 'Proje'), h('small', {}, 'Aynı kasada yeni bir proje (sihirbazla)'))));
    menu.hidden = false;
    // Ekrana sığacak biçimde konumla (sağdan / soldan taşmaz): düğmenin altında, gerekirse sola kaydırılır.
    if (window.innerWidth > 860) {
      const d = dugme.getBoundingClientRect();
      const genislik = Math.min(760, window.innerWidth - 24);
      menu.style.setProperty('position', 'fixed');
      menu.style.setProperty('width', `${genislik}px`);
      menu.style.setProperty('top', `${Math.round(d.bottom + 8)}px`);
      menu.style.setProperty('left', `${Math.round(Math.max(12, Math.min(d.left, window.innerWidth - genislik - 12)))}px`);
    } else {
      for (const p of ['position', 'width', 'top', 'left']) menu.style.removeProperty(p);
    }
    dugme.setAttribute('aria-expanded', 'true');
    /** @type {HTMLElement | null} */ (menu.querySelector('[role="menuitem"]'))?.focus();
  };
  dugme.addEventListener('click', () => (menu.hidden ? ac() : kapat()));
  menu.addEventListener('keydown', (o) => {
    const ogeler = /** @type {HTMLElement[]} */ ([...menu.querySelectorAll('[role="menuitem"]')]);
    const i = ogeler.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    if (o.key === 'Escape') { o.preventDefault(); kapat(true); }
    else if (o.key === 'ArrowDown') { o.preventDefault(); ogeler[(i + 1) % ogeler.length].focus(); }
    else if (o.key === 'ArrowUp') { o.preventDefault(); ogeler[(i - 1 + ogeler.length) % ogeler.length].focus(); }
    else if (o.key === 'Home') { o.preventDefault(); ogeler[0].focus(); }
    else if (o.key === 'End') { o.preventDefault(); ogeler[ogeler.length - 1].focus(); }
  });
  document.addEventListener('click', (o) => { if (!menu.hidden && !kap.contains(/** @type {Node} */ (o.target))) kapat(); });
  return kap;
}
