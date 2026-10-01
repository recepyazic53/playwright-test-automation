// TIKLAMA ZAMANLAMASI fikstürü (127.0.0.1; değerler sahte, dışarıya istek yok). Tek sayfa, yol ile değişen davranış:
//  - "Aç" bağlantısı bir pencere (modal) açar: pencere display:block olur ve saydamlığı betikle (jQuery fadeIn gibi) 450 ms'de 0 → 1
//    çıkar. Pencerenin içindeki "KART İLE DEVAM" bağlantısının tıklama işleyicisi animasyon BİTTİKTEN SONRA bağlanır (/kart; önce
//    tıklanırsa yutulur — href="#") ya da ilk tıklama yalnız işleyiciyi kurar (/kart-tembel; ilk tıklama yutulur, görünüm değişmez).
//    İşleyici kart formunu (#isim) gösterir.
//  - "Öde" düğmesi: tıklayınca POST /ode isteği atar, sayfada hiçbir şey değişmez (sunucu sayacı tıklama sayısını gösterir).
//  - "Say" düğmesi: tıklayınca metni hemen değişir ("Tıklama: N"); istek atmaz.
//  - "Ölü bağlantı": hiçbir işleyicisi yoktur (hiçbir zaman bir şey olmaz).
import type { FiksturIstegi, FiksturYaniti } from './giris-fikstur';

export const KART_SAYFASI = (tembel: boolean): string => `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Ödeme</title>
<style>
  #pencere { display: none; opacity: 0; position: fixed; top: 60px; left: 60px; width: 420px; min-height: 160px; background: #fff; border: 1px solid #888; padding: 12px; }
  #kartFormu { display: none; }
</style></head><body>
<h1>Ödeme</h1>
<a href="#" id="ac">Aç</a>
<div id="pencere" class="modal" role="dialog" aria-label="Kart">
  <h2>KART İLE ÖDE</h2>
  <a href="#" id="kartla">KART İLE DEVAM</a>
  <form id="kartFormu"><label>Kart üzerindeki isim <input id="isim"></label></form>
</div>
<p><button type="button" id="ode">Öde</button></p>
<p><button type="button" id="say">Say</button> <span id="sayac">Tıklama: 0</span></p>
<p><a href="#" id="olu">Ölü bağlantı</a></p>
<script>
  const pencere = document.getElementById('pencere');
  const bagla = () => document.getElementById('kartla').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('kartFormu').style.display = 'block';
  });
  document.getElementById('ac').addEventListener('click', (e) => {
    e.preventDefault();
    pencere.style.display = 'block';
    const t0 = performance.now();
    const adim = () => {
      const k = Math.min(1, (performance.now() - t0) / 450);
      pencere.style.opacity = String(k);
      if (k < 1) requestAnimationFrame(adim);
      else if (${tembel}) {
        // Tembel bağlama: ilk tıklama yalnız işleyiciyi kurar (görünümde değişiklik yok, istek yok) — tıklama yutulur.
        document.getElementById('kartla').addEventListener('click', (e) => { e.preventDefault(); setTimeout(bagla, 300); }, { once: true });
      } else bagla();
    };
    requestAnimationFrame(adim);
  });
  document.getElementById('ode').addEventListener('click', () => { void fetch('/ode', { method: 'POST', body: 'x' }); });
  let n = 0;
  document.getElementById('say').addEventListener('click', () => { n++; document.getElementById('sayac').textContent = 'Tıklama: ' + n + ' kez'; });
</script></body></html>`;

/** Sunucu durumu: POST /ode sayısı. */
export type KartSunucusu = { odeme: number };

export function kartUygulamasi(d: KartSunucusu): (i: FiksturIstegi) => FiksturYaniti {
  return (i) => {
    if (i.yol === '/kart') return { tur: 'text/html; charset=utf-8', govde: KART_SAYFASI(false) };
    if (i.yol === '/kart-tembel') return { tur: 'text/html; charset=utf-8', govde: KART_SAYFASI(true) };
    if (i.yol === '/ode' && i.yontem === 'POST') { d.odeme++; return { tur: 'application/json', govde: '{"tamam":true}', gecikmeMs: 200 }; }
    return { durum: 404, tur: 'text/plain', govde: 'yok' };
  };
}
