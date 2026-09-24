// Dashboard HTML iskeleti (yalnızca işaretleme). CSS (dashboard-stil.css) ve istemci
// betiği (dashboard-istemci.js) üretim anında okunup sayfaya olduğu gibi gömülür; sunucu
// tarafı değerler (VERI, ORTAM, TEST_SUNUCU) istemci betiğinden hemen önce, aynı <script>
// etiketinin başında tanımlanır.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const buKlasor = dirname(fileURLToPath(import.meta.url));
const ISTEMCI_BASLANGIC_ISARETI = '// --- İSTEMCİ KODU BAŞLANGICI ---\n';

export function escapeHtml(metin) {
  return String(metin).replace(/[&<>"']/g, (karakter) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[karakter]));
}

function stilOku() {
  return readFileSync(join(buKlasor, 'dashboard-stil.css'), 'utf-8');
}

// Dosyanın başındaki açıklama bloğu (işarete kadar) sayfaya gömülmez.
function istemciBetiginiOku() {
  const metin = readFileSync(join(buKlasor, 'dashboard-istemci.js'), 'utf-8');
  const konum = metin.indexOf(ISTEMCI_BASLANGIC_ISARETI);
  if (konum === -1) throw new Error('dashboard-istemci.js içinde "İSTEMCİ KODU BAŞLANGICI" işareti bulunamadı.');
  return metin.slice(konum + ISTEMCI_BASLANGIC_ISARETI.length);
}

// veri: urun-hata-raporu.mjs'deki VERI nesnesi (başlıktaki etiket/üretim zamanı için);
// veriJson: aynı nesnenin <script> içine gömülmeye hazır JSON'u ("<" kaçışlı).
// sonKosuOzet/sonKosuToplam/sonKosuOran: kenar çubuğundaki genel başarı donutu.
export function dashboardHtmlOlustur({
  ortam,
  veri,
  veriJson,
  sonKosuOzet,
  sonKosuToplam,
  sonKosuOran,
  testSunucuTaban,
  testSunucuToken
}) {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${ortam.toUpperCase()} Ortamı - Test Dashboard</title>
<style>
${stilOku()}</style>
</head>
<body>
<div class="viz-root">
  <aside class="kenar-cubugu">
    <div class="marka">
      <div class="marka-sol">
        <div class="marka-simge">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
        </div>
        <div class="kenar-daralinca-gizli">
          <div class="marka-metin-baslik">${ortam.toUpperCase()} Ortamı</div>
          <div class="marka-metin-alt">Test Dashboard</div>
        </div>
      </div>
      <button type="button" class="kenar-cubugu-dugme kenar-cubugu-dugme-ust" id="kenarCubuguDugmesiUst" title="Kenar çubuğunu daralt/genişlet" aria-label="Kenar çubuğunu daralt/genişlet">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"></path></svg>
      </button>
    </div>

    <div class="donut-kart kenar-daralinca-gizli">
      <div class="donut-satir">
        <div class="donut-sarma">
          <div class="donut-halka${sonKosuToplam === 0 ? ' bos' : ''}" style="--oran:${sonKosuOran}"></div>
          <div class="donut-oyuk">${sonKosuToplam === 0 ? '—' : '%' + sonKosuOran}</div>
        </div>
        <div class="donut-detay">
          <div><span class="nokta nokta-iyi"></span>Başarılı ${sonKosuOzet.basarili}</div>
          <div><span class="nokta nokta-kotu"></span>Başarısız ${sonKosuOzet.basarisiz}</div>
          <div><span class="nokta nokta-notr"></span>Atlanan ${sonKosuOzet.atlanan}</div>
          ${sonKosuOzet.durduruldu ? `<div><span class="nokta nokta-notr"></span>Durduruldu ${sonKosuOzet.durduruldu}</div>` : ''}
        </div>
      </div>
      <div class="donut-etiket">Güncel durum: ${escapeHtml(veri.sonKosuEtiket)}</div>
    </div>

    <div class="kenar-daralinca-gizli kenar-urun-blok">
      <button type="button" class="yan-baslik yan-baslik-dugme" id="urunListesiBasligi" aria-expanded="true">
        <span>Ürünler</span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"></path></svg>
      </button>
      <nav class="urun-nav" id="urunNav" style="margin-top:6px"></nav>
    </div>

    <button type="button" class="kenar-cubugu-dugme" id="kenarCubuguDugmesi" title="Kenar çubuğunu daralt/genişlet" aria-label="Kenar çubuğunu daralt/genişlet">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"></path></svg>
    </button>
  </aside>

  <main class="icerik">
    <div class="ust-baslik">
      <div>
        <h1 id="anaBaslik">Genel Bakış</h1>
        <div class="alt-baslik">Üretim: ${escapeHtml(veri.uretimZamani)}</div>
      </div>
      <button type="button" id="senaryoOlusturButonu" class="senaryo-olustur-buton" style="display:none">+ Senaryo Oluştur</button>
    </div>

    <div class="stat-grid" id="statGrid"></div>
    <p class="stat-kaynak" id="statKaynak"></p>

    <div class="ikiz-izgara">
      <section>
        <div class="bolum-baslik-satir"><h2>Koşu trendi</h2><span class="bolum-baslik-sayi" id="trendBaslikSayisi"></span></div>
        <p class="bolum-alt" id="trendAltBaslik"></p>
        <div class="tarih-filtre">
          <label>Başlangıç <input type="datetime-local" id="baslangicTarihiTrend" /></label>
          <label>Bitiş <input type="datetime-local" id="bitisTarihiTrend" /></label>
          <button type="button" id="tumZamanlarButonuTrend">Tüm zamanlar</button>
          <span class="secim-ozeti" id="secimOzetiTrend"></span>
        </div>
        <div class="kart trend-kart">
          <div class="trend-lejant">
            <span><span class="nokta" style="background:var(--good)"></span>Başarılı</span>
            <span><span class="nokta" style="background:var(--critical)"></span>Başarısız</span>
          </div>
          <div id="trendSvgAlani"></div>
        </div>
      </section>

      <section>
        <div class="bolum-baslik-satir"><h2 id="ucuncuBaslik">Ürün bazlı başarı</h2><span class="bolum-baslik-sayi" id="ucuncuBaslikSayisi"></span></div>
        <p class="bolum-alt" id="ucuncuAltBaslik"></p>
        <div class="tarih-filtre">
          <label>Başlangıç <input type="datetime-local" id="baslangicTarihiUrun" /></label>
          <label>Bitiş <input type="datetime-local" id="bitisTarihiUrun" /></label>
          <button type="button" id="tumZamanlarButonuUrun">Tüm zamanlar</button>
          <span class="secim-ozeti" id="secimOzetiUrun"></span>
        </div>
        <div class="kart grafik-kart" id="ozetGrafikAlani"></div>
      </section>
    </div>

    <div class="ikiz-izgara ikiz-izgara-tablolar">
      <section>
        <div class="bolum-baslik-satir"><h2>Koşu geçmişi</h2><span class="bolum-baslik-sayi" id="kosuGecmisiBaslikSayisi"></span></div>
        <p class="bolum-alt">Bugüne kadarki tüm koşular — tarih aralığıyla daraltabilir, sayfa sayfa gezebilirsiniz.</p>
        <div class="tarih-filtre">
          <label>Başlangıç <input type="datetime-local" id="baslangicTarihiKosu" /></label>
          <label>Bitiş <input type="datetime-local" id="bitisTarihiKosu" /></label>
          <button type="button" id="tumZamanlarButonuKosu">Tüm zamanlar</button>
          <span class="secim-ozeti" id="secimOzetiKosu"></span>
        </div>
        <div class="kart">
          <table class="veri-tablosu">
            <thead>
              <tr>
                <th class="siralanabilir" data-tablo="kosuGecmisi" data-anahtar="z" data-tur="zaman">Koşu<span class="siralama-ok"></span></th>
                <th>Ürünler</th>
                <th class="num siralanabilir" data-tablo="kosuGecmisi" data-anahtar="toplam" data-tur="sayi">Toplam<span class="siralama-ok"></span></th>
                <th class="num siralanabilir" data-tablo="kosuGecmisi" data-anahtar="basarili" data-tur="sayi">Başarılı<span class="siralama-ok"></span></th>
                <th class="num siralanabilir" data-tablo="kosuGecmisi" data-anahtar="basarisiz" data-tur="sayi">Başarısız<span class="siralama-ok"></span></th>
                <th class="num siralanabilir" data-tablo="kosuGecmisi" data-anahtar="atlanan" data-tur="sayi">Atlanan<span class="siralama-ok"></span></th>
                <th class="num siralanabilir" data-tablo="kosuGecmisi" data-anahtar="durduruldu" data-tur="sayi">Durduruldu<span class="siralama-ok"></span></th>
                <th class="num siralanabilir" data-tablo="kosuGecmisi" data-anahtar="oran" data-tur="sayi">Başarı oranı<span class="siralama-ok"></span></th>
              </tr>
            </thead>
            <tbody id="kosuGecmisiGovdesi"></tbody>
          </table>
          <div class="sayfalama" id="kosuGecmisiSayfalama"></div>
        </div>
      </section>

      <section>
        <div class="bolum-baslik-satir"><h2 id="ikinciBaslik">Ürün bazlı özet</h2><span class="bolum-baslik-sayi" id="ikinciBaslikSayisi"></span></div>
        <p class="bolum-alt" id="ikinciAltBaslik"></p>
        <div id="ikinciBolumAlani"></div>
      </section>
    </div>

    <div class="yari-izgara">
      <section>
        <div class="bolum-baslik-satir"><h2 id="secilenUrunBasligi">Hata kalıpları</h2><span class="bolum-baslik-sayi" id="kalipBaslikSayisi"></span></div>
        <p class="bolum-alt">Tarih aralığını daraltın; aynı kalıptaki hatalar tek satırda toplanır.</p>
        <div class="tarih-filtre">
          <label>Başlangıç <input type="datetime-local" id="baslangicTarihi" /></label>
          <label>Bitiş <input type="datetime-local" id="bitisTarihi" /></label>
          <button type="button" id="tumZamanlarButonu">Tüm zamanlar</button>
          <span class="secim-ozeti" id="secimOzeti"></span>
        </div>
        <div class="hata-panel">
          <div class="kategori-kart" id="kategoriDonutAlani"></div>
          <div>
            <div id="kalipTablosuAlani"></div>
            <div class="sayfalama" id="kalipTablosuSayfalama"></div>
          </div>
        </div>
      </section>
      <section>
        <div class="bolum-baslik-satir"><h2 id="senaryoTablosuBasligi">Senaryolar</h2><span class="bolum-baslik-sayi" id="senaryoTablosuBaslikSayisi"></span></div>
        <p class="bolum-alt">Soldaki ürün listesinden birini seçtiğinizde sadece o ürünün senaryoları listelenir — ▷ ikonuna basarak doğrudan buradan çalıştırabilirsiniz. "Koşuda" anahtarı senaryonun koşuya (Koşuyu başlat, npm run test) dahil olup olmadığını belirler; hariç senaryolar soluk görünür ama ▷ ile yine çalıştırılabilir. Çalışması için bir terminalde "npm run test-sunucu" açık olmalıdır.</p>
        <div class="tarih-filtre">
          <label>Ara <input type="text" id="senaryoTablosuArama" placeholder="Senaryo veya ürün adı..." /></label>
          <span class="secim-ozeti" id="senaryoTablosuSecimOzeti"></span>
          <span class="kosuda-sayaci" id="senaryoKosudaSayaci" title="Görünen senaryolardan kaçı koşu listesinde (tests/data/kosu-listesi.json)"></span>
          <button type="button" class="senaryo-toplu-buton" id="senaryoTumunuCalistirButonu" title="Bu görünümdeki, koşuya dahil senaryoları sırayla koşar">▷ Koşuyu başlat</button>
          <button type="button" class="senaryo-toplu-buton senaryo-toplu-buton-vurgulu" id="senaryoSecilenleriCalistirButonu" style="display:none;">▷ Seçilenleri çalıştır (<span id="senaryoSecilenSayisi">0</span>)</button>
          <button type="button" class="senaryo-toplu-buton" id="senaryoKosuyaEkleButonu" style="display:none;">+ Koşuya ekle (<span id="senaryoKosuyaEkleSayisi">0</span>)</button>
          <button type="button" class="senaryo-toplu-buton" id="senaryoKosudanCikarButonu" style="display:none;">− Koşudan çıkar (<span id="senaryoKosudanCikarSayisi">0</span>)</button>
        </div>
        <div class="kart">
          <table class="veri-tablosu">
            <thead>
              <tr>
                <th class="senaryo-tablosu-secim-hucre"><input type="checkbox" id="senaryoTumunuSecCheckbox" title="Görünen tüm senaryoları seç/kaldır" aria-label="Görünen tüm senaryoları seç/kaldır" /></th>
                <th>Ürün</th>
                <th>Senaryo</th>
                <th class="senaryo-tablosu-kosuda-hucre" title="Koşuya dahil mi? (Koşuyu başlat ve npm run test yalnızca dahil senaryoları koşar)">Koşuda</th>
                <th class="num">Çalıştır</th>
                <th class="senaryo-tablosu-duzenle-hucre">Düzenle</th>
              </tr>
            </thead>
            <tbody id="senaryoTablosuGovdesi"></tbody>
          </table>
          <div class="sayfalama" id="senaryoTablosuSayfalama"></div>
        </div>
      </section>
    </div>

    <footer>Bu sayfa her "npm run rapor:${ortam}" / "npm run hata:ozet:${ortam}" çalıştığında yeniden üretilir. Senaryo listesindeki ▷ Başlat ikonlarının çalışması için bir terminalde "npm run test-sunucu" açık olmalıdır.</footer>
  </main>

  <div class="modal-ortu" id="adimDetayModalOrtu">
    <div class="modal-kutu">
      <button type="button" class="modal-kapat" id="adimDetayModalKapatButonu" aria-label="Kapat">×</button>
      <div id="adimDetayModalIcerik"></div>
    </div>
  </div>

  <div class="modal-ortu gorsel-buyutme-ortu" id="gorselBuyutmeOrtu">
    <div class="gorsel-buyutme-kutu">
      <button type="button" class="modal-kapat" id="gorselBuyutmeKapatButonu" aria-label="Kapat">×</button>
      <img id="gorselBuyutmeResim" src="" alt="Büyütülmüş ekran görüntüsü" />
    </div>
  </div>

  <div class="modal-ortu" id="senaryoSonucModalOrtu">
    <div class="modal-kutu">
      <button type="button" class="modal-kapat" id="senaryoSonucModalKapatButonu" aria-label="Kapat">×</button>
      <div id="senaryoSonucModalIcerik"></div>
    </div>
  </div>

  <div class="modal-ortu" id="senaryoCanliPanelOrtu">
    <div class="modal-kutu genis">
      <button type="button" class="modal-kapat" id="senaryoCanliPanelKapatButonu" aria-label="Kapat">×</button>
      <div class="canli-panel-baslik-satir">
        <div>
          <p class="modal-baslik" id="senaryoCanliPanelBaslik">Senaryolar çalışıyor...</p>
          <p class="modal-alt" id="senaryoCanliPanelAltBaslik" style="margin:0;"></p>
        </div>
        <button type="button" class="senaryo-durdur-buton" id="senaryoCanliPanelDurdurButonu" title="Tümünü durdur" aria-label="Tümünü durdur">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14"></rect></svg>
        </button>
      </div>
      <div id="senaryoCanliPanelListesi"></div>
    </div>
  </div>

  <div class="modal-ortu" id="topluKosuOnayOrtu">
    <div class="modal-kutu" role="dialog" aria-modal="true" aria-labelledby="topluKosuOnayBaslik">
      <button type="button" class="modal-kapat" id="topluKosuOnayKapatButonu" aria-label="Kapat">×</button>
      <p class="modal-baslik" id="topluKosuOnayBaslik">Toplu koşuyu başlat?</p>
      <p id="topluKosuOnayMetni"></p>
      <div class="senaryo-form-buton-satir">
        <button type="button" id="topluKosuOnayIptal">Vazgeç</button>
        <button type="button" class="birincil" id="topluKosuOnayBaslat">▷ Başlat</button>
      </div>
    </div>
  </div>

  <div class="modal-ortu" id="senaryoOlusturModalOrtu">
    <div class="modal-kutu genis">
      <button type="button" class="modal-kapat" id="senaryoOlusturModalKapatButonu" aria-label="Kapat">×</button>
      <div id="senaryoOlusturModalIcerik"></div>
    </div>
  </div>

  <!-- "✎ Düzenle" — JetSeyahat dışındaki ürünler: salt okunur özet + "Koşuya dahil" -->
  <div class="modal-ortu" id="senaryoDuzenleModalOrtu">
    <div class="modal-kutu" role="dialog" aria-modal="true" aria-labelledby="senaryoDuzenleModalBaslik">
      <button type="button" class="modal-kapat" id="senaryoDuzenleModalKapatButonu" aria-label="Kapat">×</button>
      <div id="senaryoDuzenleModalIcerik"></div>
    </div>
  </div>

  <div id="kosuListesiBildirim" class="kosu-listesi-bildirim" role="status" aria-live="polite" hidden></div>

  <div id="canliPanelKucukRozet" class="canli-panel-kucuk-rozet" role="button" tabindex="0" title="Koşu panelini yeniden aç" style="display:none;">
    <span class="senaryo-spinner" id="canliPanelKucukRozetSpinner" style="width:12px;height:12px;border-width:2px;"></span>
    <span id="canliPanelKucukRozetMetin"></span>
  </div>
</div>

<script>
  var VERI = ${veriJson};
  // Dashboard'daki ▷ Başlat butonlarının konuştuğu yerel test tetikleme sunucusu
  // (bkz. scripts/test-sunucu.mjs — "npm run test-sunucu" ile ayrı bir pencerede
  // çalıştırılmalı). Token yalnızca bu makinede üretilir, sunucu da aynı dosyadan
  // okur; başka bir origin bu isteği asla tetikleyemez.
  var ORTAM = ${JSON.stringify(ortam)};
  var TEST_SUNUCU = { taban: ${JSON.stringify(testSunucuTaban)}, token: ${JSON.stringify(testSunucuToken)} };
${istemciBetiginiOku()}</script>
</body>
</html>`;
}
