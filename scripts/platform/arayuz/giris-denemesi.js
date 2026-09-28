// "Girişi dene" (genel): ortamın giriş tarifi ve giriş profiliyle YALNIZ giriş yapılır; ekran ya da senaryo gerekmez. Kayıtlı
// oturum kullanılmaz ve saklanmaz. YALNIZCA kullanıcı onaylayınca başlar (siteye gerçek giriş isteği gider); CANLI ortamda
// ayrıca tek tip CANLI onayı sorulur (sunucu da canliOnay ister). İsteğe bağlı olarak tarayıcı görünür açılır. Sonuç bir diyalogda: "Giriş başarılı" ya da
// hangi adımda neden takıldığı, takıldığı / girdiği sayfanın yolu, ekran görüntüsü (yalnız bellekte) ve adım günlüğü (değer yok).
// SMS "elle" kipinde kod formu diyalogda açılır. Ayarlar > Giriş profilleri > Giriş tarifi satırından
// açılır. Sunucu: tarama/yonetici.mjs (kip 'girisDenemesi').
import { api, bildir, h, ikon } from './ortak.js';
import { canliOnayEki, canliOnayIste, onayIste } from './kosu-paneli.js';
import { kodFormu } from './tarama.js';


/** "Girişi dene" düğmesi (Ayarlar > Giriş tarifi ortam satırı). @param {any} o ortam satırı (giris-tarifleri) @param {string} projeId */
export function girisiDeneDugmesi(o, projeId) {
  const kapali = !o.tarif;
  return h('button', {
    type: 'button', class: 'kucuk-dugme', 'aria-label': `${o.ortamAd}: girişi dene`, disabled: kapali,
    title: !o.tarif ? 'Önce giriş tarifini tanımlayın.' : 'Yalnız girişi dener; kayıtlı oturum kullanılmaz.',
    onclick: () => girisiDene(o, projeId)
  }, ikon('oynat'), 'Girişi dene');
}

/** @param {any} o @param {string} projeId */
export async function girisiDene(o, projeId) {
  const gorunur = h('input', { type: 'checkbox', id: `giris-denemesi-gorunur-${o.ortamId}` });
  const tamam = await onayIste({
    baslik: `${o.ortamAd}: giriş denensin mi?`, ikonAd: 'ag', dugme: 'Girişi dene',
    metin: `Nöbetçi, ${o.ortamAd} ortamının giriş tarifi ve giriş profiliyle yalnızca giriş yapar. Siteye gerçek bir giriş isteği gider (dış siteye istek). Kayıtlı oturum kullanılmaz ve saklanmaz.`,
    ek: h('label', { class: 'secenek', for: gorunur.id }, gorunur, 'Tarayıcıyı göster (girişi izleyin)')
  });
  if (!tamam) return;
  if (!(await canliOnayIste({ id: o.ortamId, ad: o.ortamAd, riskli: o.riskli, canli: o.canli }, 'Giriş denemesi'))) return;
  let isId;
  try {
    ({ isId } = await api('/platform/tarama/baslat', { govde: { kip: 'girisDenemesi', projeId, ortamId: o.ortamId, onay: true, gorunur: gorunur.checked, ...canliOnayEki(o.ortamId) } }));
  } catch (hata) {
    bildir(hata.message, 'hata');
    return;
  }
  sonucDiyalogu(o, isId);
}

/** İlerleme + sonuç diyaloğu (durum 1 sn'de bir okunur). @param {any} o @param {string} isId */
function sonucDiyalogu(o, isId) {
  const durumMetni = h('p', { role: 'status' }, 'Giriş deneniyor…');
  const kodAlani = h('div', {});
  const gunluk = h('ol', { class: 'giris-denemesi-gunlugu kucuk soluk' });
  const sonuc = h('div', { 'aria-live': 'polite' });
  const iptal = h('button', { type: 'button', class: 'hayalet' }, 'İptal');
  const kapat = h('button', { type: 'button', class: 'birincil', hidden: true }, 'Kapat');
  const diyalog = h('dialog', { class: 'onay-diyalogu genis-onay giris-denemesi', 'aria-labelledby': 'giris-denemesi-basligi' },
    h('div', { class: 'diyalog-govde' },
      h('h2', { id: 'giris-denemesi-basligi' }, h('span', { class: 'diyalog-ikon', 'aria-hidden': 'true' }, ikon('anahtar')), `Giriş denemesi: ${o.ortamAd}`),
      durumMetni, kodAlani, sonuc, gunluk),
    h('div', { class: 'diyalog-alt' }, iptal, kapat));
  let bitti = false;
  let kodFormuEl = null;
  diyalog.addEventListener('close', () => { bitti = true; diyalog.remove(); });
  kapat.addEventListener('click', () => diyalog.close());
  iptal.addEventListener('click', async () => {
    if (!bitti) { try { await api('/platform/tarama/iptal', { govde: { id: isId } }); } catch { /* bitmiş olabilir */ } }
    diyalog.close();
  });
  document.body.append(diyalog);
  diyalog.showModal();

  const bitir = (d) => {
    bitti = true;
    iptal.hidden = true;
    kapat.hidden = false;
    kodAlani.replaceChildren();
    const x = d.deneme;
    if (d.durum === 'tamam' && x) {
      durumMetni.replaceChildren();
      sonuc.replaceChildren(
        x.basarili
          ? h('div', { class: 'not-kutusu basari', role: 'status' }, ikon('onay'), ` Giriş başarılı. Giriş sonrası sayfa: ${x.yol || '/'}`)
          : h('div', { class: 'not-kutusu hata', role: 'alert' }, h('p', {}, h('strong', {}, 'Giriş başarısız: '), x.hata ? x.hata.mesaj : 'bilinmeyen hata'),
            x.yol ? h('p', { class: 'kucuk' }, `Takıldığı sayfa: ${x.yol}`) : null),
        x.goruntu ? h('img', { class: 'giris-denemesi-goruntusu', src: `data:image/jpeg;base64,${x.goruntu}`, alt: x.basarili ? 'Giriş sonrası sayfanın görüntüsü' : 'Girişin takıldığı sayfanın görüntüsü' }) : null);
      gunluk.replaceChildren(...x.gunluk.map((m) => h('li', {}, m)));
    } else {
      durumMetni.replaceChildren();
      sonuc.replaceChildren(h('div', { class: 'not-kutusu hata', role: 'alert' }, (d.hata && d.hata.mesaj) || 'Giriş denemesi tamamlanmadı.'));
    }
    kapat.focus();
  };

  (async () => {
    for (;;) {
      if (bitti || !diyalog.isConnected) return;
      let d;
      try { d = (await api(`/platform/tarama/durum?id=${encodeURIComponent(isId)}`)).is; } catch (hata) { durumMetni.textContent = hata.message; return; }
      if (d.durum !== 'suruyor') { bitir(d); return; }
      const son = d.olaylar.length ? d.olaylar[d.olaylar.length - 1].mesaj : null;
      durumMetni.textContent = son ? `Giriş deneniyor… ${son}` : 'Giriş deneniyor…';
      if (d.kodIstegi && !kodFormuEl) {
        kodFormuEl = kodFormu(isId, d.kodIstegi, () => { kodFormuEl = null; kodAlani.replaceChildren(); });
        kodAlani.replaceChildren(kodFormuEl);
      } else if (d.kodIstegi && kodFormuEl) {
        kodFormuEl.kalanGuncelle(d.kodIstegi.kalanSn);
      } else if (!d.kodIstegi && kodFormuEl) {
        kodFormuEl = null;
        kodAlani.replaceChildren();
      }
      await new Promise((c) => setTimeout(c, 1000));
    }
  })();
}
