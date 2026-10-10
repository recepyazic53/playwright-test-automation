// Ayarlar > Güvenlik ve erişim > Ekip (#/ayarlar/guvenlik/ekip; eski #/ayarlar/ekip yönlenir; yalnız Admin): dosyayı açabilecek kişiler ve rolleri. Sunucu: GET /platform/ekip, POST /platform/ekip/kaydet
// (ekip.mjs). Liste boşken herkes açabilir; dolunca dosyayı yalnız listedeki kullanıcı adları açar. Liste ortak yayınla diğer
// bilgisayarlara gider (Yedekleme ve saklama > Ekip paylaşımı).
import { api, bildir, h, ikon, mesajKutusu, mesgulIken } from './ortak.js';

const ROLLER = [['admin', 'Admin'], ['kullanici', 'Kullanıcı']];

/** @param {HTMLElement} govde */
export async function ekipBolumu(govde) {
  const veri = await api('/platform/ekip');
  /** @type {Array<{ ad: string; rol: string }>} */
  let uyeler = veri.uyeler.map((u) => ({ ...u }));
  const ben = veri.ben || '';
  const mesaj = mesajKutusu();
  const liste = h('div', { class: 'ekip-listesi', role: 'list', 'aria-label': 'Ekip üyeleri' });
  const kaydet = h('button', { type: 'button', class: 'birincil' }, ikon('onay'), 'Kaydet');
  const ekle = h('button', { type: 'button' }, ikon('arti'), 'Kişi ekle');

  const ciz = () => {
    liste.replaceChildren(...uyeler.map((u, i) => {
      const benMi = ben && u.ad.trim().toLocaleLowerCase('tr') === ben.toLocaleLowerCase('tr');
      const ad = h('input', { type: 'text', value: u.ad, maxlength: '60', autocomplete: 'off', spellcheck: 'false', 'aria-label': `${i + 1}. kişinin kullanıcı adı`, placeholder: 'Kullanıcı adı' });
      ad.addEventListener('input', () => { u.ad = ad.value; });
      const rol = h('select', { 'aria-label': `${i + 1}. kişinin rolü` }, ROLLER.map(([d, m]) => h('option', { value: d, selected: u.rol === d }, m)));
      rol.addEventListener('change', () => { u.rol = rol.value; });
      const sil = h('button', { type: 'button', class: 'kucuk-dugme hayalet', 'aria-label': `${u.ad || `${i + 1}. kişi`}: sil`, disabled: Boolean(benMi) },
        ikon('cop'), 'Sil');
      sil.addEventListener('click', () => { uyeler.splice(i, 1); ciz(); });
      return h('div', { class: 'ekip-satiri', role: 'listitem' }, ad, rol, sil, benMi ? h('span', { class: 'soluk kucuk' }, 'siz') : null);
    }));
    if (!uyeler.length) liste.append(h('p', { class: 'soluk' }, 'Ekip listesi boş: dosyayı kasa parolasını bilen herkes açabilir.'));
  };
  ekle.addEventListener('click', () => {
    uyeler.push({ ad: '', rol: 'kullanici' });
    ciz();
    /** @type {HTMLInputElement | null} */ (liste.querySelector('.ekip-satiri:last-child input'))?.focus();
  });
  kaydet.addEventListener('click', async () => {
    mesaj.temizle();
    try {
      const r = await mesgulIken(kaydet, 'Kaydediliyor…', () => api('/platform/ekip/kaydet', { govde: { uyeler: uyeler.filter((u) => u.ad.trim()) } }));
      uyeler = r.uyeler.map((/** @type {{ ad: string; rol: string }} */ u) => ({ ...u }));
      ciz();
      bildir('Ekip kaydedildi. Diğer bilgisayarlara gitmesi için Yedekleme ve saklama > Ekip paylaşımı\'ndan yayınlayın.');
    } catch (hata) { mesaj.goster(hata.message); }
  });
  ciz();
  govde.replaceChildren(h('div', { class: 'kart', role: 'group', 'aria-label': 'Kişiler ve roller' },
    h('h3', {}, ikon('kullanici'), 'Kişiler ve roller'),
    h('p', { class: 'soluk' }, 'Bu dosyayı açabilecek kişiler. Dosya açılırken girilen kullanıcı adı bu listede yoksa "Yetkili değilsiniz" denir. ',
      'Admin bu bölümü görür ve listeyi düzenler; Kullanıcı bu bölümü görmez. Girişteki ad, yayınlarda "kim yaptı" olarak görünür.'),
    h('p', { class: 'soluk kucuk' }, ben ? `Giriş yapan: ${ben}` : 'Dosyayı kullanıcı adı yazmadan açtınız. Listeye kendinizi Admin olarak eklemeyi unutmayın.'),
    mesaj.kutu, liste,
    h('div', { class: 'dugmeler' }, ekle, kaydet)));
}
