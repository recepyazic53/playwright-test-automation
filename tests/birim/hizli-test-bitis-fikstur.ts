// HIZLI TEST BİTİŞ ÖĞESİ TESTLERİNİN YEREL FİKSTÜRÜ (spec DEĞİL). Sahte talep sayfası 127.0.0.1'de geçici bir http sunucusunda
// (giris-fikstur.ts > yerelSunucu) çalışır; tüm metinler ve değerler UYDURMADIR, hiçbir gerçek siteye bağlanılmaz.
//
//   /talep/   "Plaka" alanı + "Talep al" düğmesi. Basınca POST /api/talep (gecikmeli) → sayfa içi pencere (div.modal role=dialog,
//              aria-labelledby başlık) açılır: başlık "Talep özeti", "Başvuran" + maskeli ad, "Tutar 300,00 TL", alan etiketi
//              "Ödeme planı" + seçili değeri yazıyla gösteren özel açılır liste (gizli select; görünen "PEŞİN"), tablo düzeninde
//              "Açık Hesap Ödeme Planı" etiketli liste ve <a href="#"> bağlantıları "KREDİ KARTI İLE TAMAMLA", "TAMAMLA",
//              "Kapat" düğmesi. Bağlantılara tıklanırsa sayılır (hiçbir test tıklamamalı).
//   kip: 'normal' | 'sessiz' (talep isteği yanıtlanır ama pencere açılmaz: bitiş öğesi görünmez).
import type { FiksturIstegi, FiksturUygulamasi, FiksturYaniti } from './giris-fikstur';

const html = (baslik: string, govde: string): FiksturYaniti => ({
  tur: 'text/html; charset=utf-8',
  govde: `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${baslik}</title>
<style>body{font:14px system-ui;margin:24px}.modal{border:1px solid #888;padding:16px;margin-top:16px;max-width:520px}.modal[hidden]{display:none}
.satir{display:flex;gap:8px;margin:6px 0}.acilir{border:1px solid #aaa;padding:2px 8px}</style></head><body>${govde}</body></html>`
});

export const TALEP_SAYFASI = `<h1>Talep</h1>
<p id="aciklama">Plaka bilgisini yazıp talep alın.</p>
<label for="plaka">Plaka</label> <input id="plaka" name="plaka">
<p><button type="button" id="talepAl">Talep al</button></p>
<div id="talepPenceresi" class="modal" role="dialog" aria-modal="true" aria-labelledby="pencereBasligi" hidden>
  <h2 id="pencereBasligi">Talep özeti</h2>
  <div class="satir"><span>Başvuran</span><b id="basvuran"></b></div>
  <p id="tutar"></p>
  <div class="satir"><span class="etiket">Ödeme planı</span>
    <select id="odemePlani" name="odemePlani" style="display:none"><option value="pesin" selected>PEŞİN</option><option value="taksit">3 TAKSİT</option></select>
    <span class="acilir" id="odemePlaniGorunen">PEŞİN</span></div>
  <table><tr><td>Açık Hesap Ödeme Planı</td><td><select id="acikHesap" name="acikHesap"><option value="">Seçiniz</option><option value="aylik">Aylık</option></select></td></tr></table>
  <p><a href="#" id="kartla">KREDİ KARTI İLE TAMAMLA</a> · <a href="#" id="tamamla">TAMAMLA</a></p>
  <p><button type="button" id="kapat">Kapat</button></p>
</div>
<script>
  var $ = function (id) { return document.getElementById(id); };
  $('talepAl').addEventListener('click', function () {
    fetch('/api/talep', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ plaka: $('plaka').value }) })
      .then(function (r) { return r.json(); }).then(function (j) {
        if (j.sessiz) return;
        $('basvuran').textContent = j.ad;
        $('tutar').textContent = 'Tutar ' + j.tutar + ' TL';
        $('talepPenceresi').hidden = false;
      });
  });
  $('kapat').addEventListener('click', function () { $('talepPenceresi').hidden = true; });
  ['kartla', 'tamamla'].forEach(function (id) {
    $(id).addEventListener('click', function (e) { e.preventDefault(); fetch('/api/baglanti?ad=' + id, { method: 'POST' }); });
  });
</script>`;

export class TalepUygulamasi {
  readonly istekler: string[] = [];
  /** POST /api/talep gövdeleri (Talep al basıldı mı?). */
  readonly talepler: string[] = [];
  /** Pencere bağlantılarına tıklamalar (hiçbir test tıklamamalı: seçim tıklaması sayfaya iletilmez). */
  readonly baglantilar: string[] = [];
  kip: 'normal' | 'sessiz' = 'normal';

  readonly isle: FiksturUygulamasi = (i: FiksturIstegi) => {
    this.istekler.push(`${i.yontem} ${i.yol}`);
    if (i.yol === '/talep/' && i.yontem === 'GET') return html('Talep', TALEP_SAYFASI);
    if (i.yol === '/api/talep' && i.yontem === 'POST') {
      this.talepler.push(i.govde);
      return { tur: 'application/json', govde: JSON.stringify(this.kip === 'sessiz' ? { sessiz: true } : { ad: 'D*** K***', tutar: '300,00' }), gecikmeMs: 600 };
    }
    if (i.yol === '/api/baglanti' && i.yontem === 'POST') { this.baglantilar.push(i.sorgu.get('ad') ?? ''); return { tur: 'application/json', govde: '{}' }; }
    return { durum: 404, tur: 'text/plain', govde: 'yok' };
  };
}
