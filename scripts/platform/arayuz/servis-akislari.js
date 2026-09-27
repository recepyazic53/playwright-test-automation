// SERVİS AKIŞLARI (servis sayfası > "Akışlar" sekmesi). Akışlar proje düzeyindedir; bir akış birden çok servisin kayıtlı
// senaryolarını sırayla koşar. Bir adımın yanıtından okunan değer (ör. token) sonraki adımlarda ${akis:Ad} ile kullanılır.
//   #/servisler/s/<id>/akislar              → bu servisin oturum akışı seçimi + projenin akışları
//   #/servisler/s/<id>/akislar/<akisId|yeni> → akış tasarımı: diyagram (servis-akis-diyagrami.js; adımlar, değer izi, Dene, koşu geçmişi)
// Oturum akışı (tür "oturum"): servise atanır; senaryolardaki ${akis:Token} değeri oturumdan gelir (koşular arasında süresi
// dolana kadar paylaşılır, 401'de yenilenir). Dene yalnız TEST; canlı koşu yalnız kullanıcı onayıyla. Açık token arayüze gelmez.
import { alan, api, bildir, bosDurum, h, ikon, rozet, tarihMetni, yerlestir } from './ortak.js';
import { onayIste } from './kosu-paneli.js';
import { servisAkisTasarimi } from './servis-akis-diyagrami.js';

const q = encodeURIComponent;
const DURUM = { basarili: ['Başarılı', 'basari'], basarisiz: ['Başarısız', 'hata'], hata: ['Hata', 'hata'], atlandi: ['Atlandı', 'durdu'], durduruldu: ['Durduruldu', 'durdu'] };
const durumRozeti = (d) => rozet(DURUM[d]?.[0] ?? d, DURUM[d]?.[1] ?? '');

/**
 * @param {HTMLElement} kap @param {{ id: string }} proje @param {any} s servis @param {any[]} ortamlar @param {string | null} altKimlik
 * @param {() => void} yenile
 */
export async function akislarSekmesi(kap, proje, s, ortamlar, altKimlik, yenile) {
  if (altKimlik) { await servisAkisTasarimi(kap, proje, s, ortamlar, altKimlik === 'yeni' ? null : altKimlik); return; }
  const { akislar } = await api(`/platform/servis-akislari?projeId=${q(proje.id)}`);
  const adres = `#/servisler/s/${q(s.id)}/akislar`;

  // --- Bu servisin oturum akışı --------------------------------------------------------------------------------------------
  const oturumlar = akislar.filter((a) => a.tur === 'oturum');
  const sec = h('select', { 'aria-label': 'Oturum akışı' }, h('option', { value: '' }, '— yok —'),
    oturumlar.map((a) => h('option', { value: a.id, selected: s.ayarlar.oturumAkisi === a.id }, a.baslik)));
  const durum = h('span', { class: 'kayit-durumu soluk kucuk', 'aria-live': 'polite' });
  sec.addEventListener('change', async () => {
    durum.textContent = 'Kaydediliyor…';
    try {
      await api('/platform/servis/kaydet', { govde: { projeId: proje.id, id: s.id, anahtar: s.anahtar, ad: s.ad, yol: s.ayarlar.yol, oturumAkisi: sec.value || null } });
      s.ayarlar.oturumAkisi = sec.value || undefined;
      durum.textContent = '✓ Kaydedildi';
    } catch (e) { durum.textContent = `Kaydedilemedi: ${e.message}`; }
  });
  const oturumKarti = h('div', { class: 'kart form-paneli' },
    h('div', { class: 'kart-basligi' }, h('h3', {}, ikon('anahtar'), 'Oturum akışı (token)'), h('span', { class: 'sag' }, durum)),
    h('p', { class: 'soluk kucuk' }, 'Bu servisin senaryolarında ', h('code', {}, '${akis:Token}'), ' gibi bir değer kullanılıyorsa (ör. başlıkta ',
      h('code', {}, 'Authorization: Bearer ${akis:Token}'), ') değer seçilen oturum akışından gelir. Token koşular arasında süresi dolana kadar yeniden kullanılır; sunucu 401 dönerse bir kez yenilenir.'),
    oturumlar.length ? alan('Oturum akışı', sec) : h('p', { class: 'soluk' }, 'Henüz oturum akışı yok. Aşağıdan türü "Oturum" olan bir akış ekleyin (ör. tek adım: Giriş → Token oku).'));

  // --- Projenin akışları ----------------------------------------------------------------------------------------------------
  const satirlar = akislar.map((a) => h('tr', {},
    h('td', {}, h('a', { class: 'satir-baglantisi', href: `${adres}/${q(a.id)}` }, a.baslik),
      a.kullananServisler.length ? h('div', { class: 'soluk kucuk' }, `Oturum: ${a.kullananServisler.map((x) => x.ad).join(', ')}`) : null),
    h('td', {}, a.tur === 'oturum' ? rozet('Oturum', 'vurgu') : rozet('Akış')),
    h('td', {}, String(a.adimSayisi)),
    h('td', {}, a.sonKosu ? (() => {
      // Ortam başına koşar (ortam koşu diyaloğunda seçilir): son koşunun ortamı da yazılır.
      const ortamAd = a.sonKosu.ortamId ? ortamlar.find((o) => o.id === a.sonKosu.ortamId)?.ad : null;
      return h('span', { class: 'akis-son-kosu', title: `${ortamAd ? `${ortamAd} · ` : ''}${tarihMetni(a.sonKosu.baslangic)}` }, durumRozeti(a.sonKosu.durum),
        ortamAd ? h('span', { class: 'soluk kucuk' }, ortamAd) : null);
    })() : h('span', { class: 'cok-soluk' }, '—')),
    h('td', { class: 'eylem' }, h('a', { class: 'dugme ikon-dugme', href: `${adres}/${q(a.id)}`, title: 'Düzenle', 'aria-label': `Düzenle: ${a.baslik}` }, ikon('duzenle')),
      h('button', { type: 'button', class: 'ikon-dugme hayalet', title: 'Sil', 'aria-label': `Sil: ${a.baslik}`, onclick: async () => {
        if (!(await onayIste({ baslik: `"${a.baslik}" silinsin mi?`, metin: 'Akış silinir; geçmiş koşu kayıtları kalır.', dugme: 'Sil', tehlikeli: true }))) return;
        try { await api('/platform/servis-akisi/sil', { govde: { projeId: proje.id, id: a.id } }); bildir('Akış silindi.'); yenile(); } catch (e) { bildir(e.message, 'hata'); }
      } }, ikon('cop')))));
  yerlestir(kap, oturumKarti,
    h('div', { class: 'kart' },
      h('div', { class: 'kart-basligi' }, h('h3', {}, 'Servis akışları'), h('span', { class: 'sag' }, h('a', { class: 'dugme kucuk-dugme', href: `${adres}/yeni` }, ikon('arti'), 'Yeni akış'))),
      h('p', { class: 'soluk kucuk' }, 'Akış, kayıtlı senaryoları sırayla koşar (başka servislerin senaryoları da olabilir). Bir adımın yanıtından okunan değer sonraki adımlarda ',
        h('code', {}, '${akis:Ad}'), ' ile gövdede, başlıkta ve kontrollerde kullanılır.'),
      akislar.length
        ? h('div', { class: 'tablo-kaydirma' }, h('table', { class: 'veri-tablosu', 'aria-label': 'Servis akışları' },
          h('thead', {}, h('tr', {}, ...['Akış', 'Tür', 'Adım', 'Son koşu', ''].map((x) => h('th', { scope: 'col' }, x)))), h('tbody', {}, satirlar)))
        : bosDurum('Henüz akış yok.', 'Örnek: 1. adım Giriş senaryosu (yanıttan Token okunur), 2. adım Teklif senaryosu (başlıkta Bearer ${akis:Token}).', { ikon: 'katman' })));
}
