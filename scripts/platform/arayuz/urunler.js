// Sol panel "ÜRÜNLER" bölümü (Sonuçlar, Senaryolar, Ekranlar ve Servisler sayfalarında aynı düzen):
//   ÜRÜNLER
//   1 · Ekranlar   → sayfanın kendi ekran listesi
//   2 · Servisler  → servisler (bağlantının hedefi sayfaya göre: Sonuçlar'da servisin Raporlar sekmesi, diğerlerinde servis sayfası)
// Servis sonuçları ekran sonuçlarına KARIŞMAZ: Sonuçlar'daki servis bağlantısı servisin kendi Raporlar sekmesini açar.
import { api, h, ikon } from './ortak.js';

/** Servis listesi; alınamazsa (ör. kasa kilitli, eski sunucu) boş. @param {{ id: string }} proje */
export async function servisleriAl(proje) {
  try { return (await api(`/platform/servisler?projeId=${encodeURIComponent(proje.id)}`)).servisler; } catch { return []; }
}

/** "ÜRÜNLER" ve "1 · Ekranlar" başlıkları. */
export function ekranlarBasligi() {
  return [
    h('div', { class: 'alt-nav-baslik', 'aria-hidden': 'true' }, 'Ürünler'),
    h('div', { class: 'alt-nav-alt-baslik', 'aria-hidden': 'true' }, '1 · Ekranlar')
  ];
}

const SAGLIK = { basarili: 'basari', basarisiz: 'hata', hata: 'hata' };

/**
 * "2 · Servisler" bölümü.
 * @param {Array<{ id: string; ad: string; durum: string; senaryoSayisi?: number; sonKosu?: { durum: string } | null }>} servisler
 * @param {{ seciliServis?: string | null; sekme?: string; saglik?: boolean }} [secenekler]
 *   sekme: servis bağlantısının açacağı sekme (ör. 'raporlar'); saglik: son çalıştırmanın durum noktası gösterilsin mi.
 */
export function servislerBolumu(servisler, secenekler = {}) {
  const baglanti = (s) => {
    const son = s.sonKosu ? SAGLIK[s.sonKosu.durum] ?? '' : '';
    const a = h('a', {
      href: `#/servisler/s/${encodeURIComponent(s.id)}${secenekler.sekme ? `/${secenekler.sekme}` : ''}`,
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
  return [
    h('div', { class: 'alt-nav-alt-baslik', 'aria-hidden': 'true' }, '2 · Servisler'),
    ...servisler.map(baglanti),
    h('a', { href: '#/servisler/yeni', class: 'ekle-baglantisi', 'aria-current': secenekler.seciliServis === 'yeni' ? 'page' : null }, ikon('arti'), 'Servis ekle')
  ];
}
