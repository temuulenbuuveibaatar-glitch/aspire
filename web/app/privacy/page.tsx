import type { Metadata } from "next";
import LegalPage, { Contact, LangJump } from "@/components/LegalPage";

// The root template adds " | Aspire". Own canonical and og:url, so it is not folded into "/".
const TITLE = "Нууцлалын бодлого · Privacy Policy";
export const metadata: Metadata = {
  title: TITLE,
  alternates: { canonical: "/privacy" },
  openGraph: { type: "website", siteName: "Aspire", title: `${TITLE} | Aspire`, url: "/privacy" },
};

const GOOGLE_POLICY = "https://developers.google.com/terms/api-services-user-data-policy";

export default function Privacy() {
  return (
    <LegalPage
      title={
        <>
          <span lang="mn">Нууцлалын бодлого</span> · Privacy Policy
        </>
      }
    >
      <LangJump />
      <section lang="mn" id="mn">
        <h2>Товчхондоо</h2>
        <ul>
          <li>
            Aspire-ийг ашиглахын тулд нэвтэрнэ. Нэвтрэлтийг <b>Clerk</b> үйлчилгээ хариуцна (Google, Apple эсвэл имэйлээр ирэх 6 оронтой
            код). Aspire нууц үг хадгалдаггүй.
          </li>
          <li>
            Санах ой, сануулга, дадал, хичээлийн явц, тохиргоо болон Discord/Slack сувгийн холбоос анхдагчаар <b>зөвхөн таны төхөөрөмж дээр</b>{" "}
            хадгалагдана.
          </li>
          <li>
            Telegram, Discord эсвэл Slack ботоо холбосон үед л тэдгээрийн хуулбар манай мэдээллийн санд (Supabase, Сөүл, Өмнөд Солонгос)
            хадгалагдана. Сануулгын мэдэгдлийг асаавал зөвхөн сануулга (текст, цаг) тэнд хадгалагдана.
          </li>
          <li>Gmail-ийг зөвхөн уншина, захидлын мэдээллийг хадгалдаггүй.</li>
          <li>Google Calendar: таныг асуухад өнөөдрийн болон энэ долоо хоногийн үйл явдлыг уншина; үйл явдлыг зөвхөн таныг &quot;Нэмэх&quot; дарсны дараа нэмнэ.</li>
          <li>Мессеж, нийтлэл, SMS, дуудлага, имэйлийг зөвхөн таныг баталгаажуулах товч дарсны дараа илгээнэ.</li>
          <li>
            Aspire Desktop таны компьютер дээр юу ч хийхээсээ өмнө тэр компьютер дээр тань асууна: та &quot;Зөвшөөрөх&quot; (Allow)
            дарсны дараа л ажиллана.
          </li>
          <li>Бид зар сурталчилгааны хянах хэрэгсэл ашигладаггүй. Таны мэдээллийг худалдахгүй.</li>
        </ul>

        <h2>Бүртгэл ба нэвтрэлт</h2>
        <p>
          Нэвтрэлтийг Clerk компани хариуцна. Та Google, Apple эсвэл имэйлээр ирэх 6 оронтой кодоор нэвтэрнэ. Clerk таны бүртгэлийг (нэр,
          имэйл хаяг, Google эсвэл Apple-аас ирсэн профайл зураг) хадгална. Aspire нууц үг хадгалдаггүй. Нэвтэрсэн байдлыг хадгалахад
          шаардлагатай cookie ашиглана.
        </p>

        <h2>Таны төхөөрөмж дээр хадгалагдах зүйл</h2>
        <p>
          Анхдагч байдлаар таны санах ой (жишээ нь, ойр байдаг буудал, гэр бүлийн гишүүний утас), сануулга, дадал (routine), хичээлийн
          явц, тохиргоо болон Discord/Slack сувгийн холбоос <b>зөвхөн таны төхөөрөмж дээр</b> хадгалагдана. Асуулт асуух үед хариулт
          гаргахын тулд түр илгээгдэх боловч бид хадгалдаггүй. &quot;Санах ой&quot; хэсгээс хэзээ ч харж, устгах боломжтой. Нууц үг,
          картын дугаар, ПИН кодыг туслах хадгалахаас татгалзана. Тохиргооноос байршил хуваалцахыг асаасан үед л ойролцоогоор (~100 м
          хүртэл бөөрөнхийлсөн) байршил асуулттай хамт болон Google Maps Platform руу зөвхөн тухайн асуултад хариулахын тулд илгээгдэх
          бөгөөд хадгалагдахгүй. Дараагийн нээлтэд шууд харуулахын тулд хамгийн сүүлийн арын зургийн холбоос, зурагчны нэр ба газрын
          нэрийг төхөөрөмж дээр хадгална (Google-ийн зургийг нэг өдөр хүртэл).
        </p>

        <h2>Байршил ба орчны мэдээлэл</h2>
        <p>
          Таны байгаа газрын цаг агаар (бороо, цас), агаарын чанар, замын түгжрэл, ойролцоох буудал, дараагийн автобус, такси болон
          тухайн газрын зургийг харуулахын тулд байршлыг ийм дарааллаар ашиглана: та зөвшөөрвөл <b>төхөөрөмжийн байршил</b>{" "}
          (ойролцоогоор 11 м); эс бөгөөс <b>таны сонгосон хот</b>; эс бөгөөс <b>сүлжээний ойролцоо байршил</b> (IP хаягаас Vercel
          тодорхойлсон хот). Нарийвчилсан байршлыг зөвхөн тухайн хүсэлтэд хариулахад ашиглана: хадгалахгүй, бүртгэлтэй тань холбохгүй.
          Орчны мэдээлэлд Google Maps Platform болон Open-Meteo руу ойролцоогоор 1 км хүртэл бөөрөнхийлсөн байршил (мөн таны бичсэн
          хотын нэр) л илгээгдэнэ; байршил хуваалцах үед чиглэл эсвэл ойролцоох газар асуувал Google ойролцоогоор 100 м нарийвчлалтай
          байршил авна. Байршил хүсэлтийн биед явах тул сайтын бүртгэлд үлддэггүй; буудал хүртэлх зайг манай сервер нарийвчилсан байршлаас тооцоод мартана. Үр дүн серверийн санах ойд түр байгаад
          устана: цаг агаар 10 минут, дараагийн автобус 10 минут, замын хөдөлгөөн 20 минут, агаарын чанар 30 минут, урьдчилсан мэдээ 3
          цаг, буудал, такси, хотын төв ба зураг нэг өдөр хүртэл. Арын зураг нь таны хотын нэрээр Wikimedia Commons-оос хайсан бүтэн
          хотын зураг (байршил илгээгдэхгүй); зурагчны нэр ба лицензийг дэлгэц дээр үргэлж харуулна. Эрдэнэт хотын автобусны шууд
          байршлыг <b>Орхон ТКХДТ</b>-ийн нээлттэй мэдээллээс авна; тэд руу таны байршил огт илгээгдэхгүй. Төхөөрөмжийн байршлыг
          Тохиргоо эсвэл хөтчийн тохиргооноос хэзээ ч унтрааж болно.
        </p>
        <p>
          <b>Нэвтрэхээс өмнөх нүүр хуудас</b> таны байгаа орчмын цаг агаарыг харуулна. Үүнд зөвхөн сүлжээний ойролцоо байршлыг (IP
          хаягаас Vercel тодорхойлсон хот) ашиглана: ойролцоогоор 11 км хүртэл бөөрөнхийлсөн байршлыг цаг агаарын мэдээ авахын тулд
          Open-Meteo руу илгээнэ. Энэ байршлыг хадгалахгүй, тантай холбохгүй; цаг агаарын мэдээ нь серверийн санах ойд 10 минут хүртэл
          байгаад устана. Сүлжээний байршил тодорхойгүй бол Эрдэнэт хотын цаг агаарыг харуулна.
        </p>

        <h2>Гудамжны хаяг</h2>
        <p>
          Төхөөрөмжийн байршлыг зөвшөөрсөн үед дэлгэц дээр гарах гудамж, байрны дугаарыг ойролцоогоор 11 м хүртэл бөөрөнхийлсөн
          байршлаар тодорхойлно: эхлээд <b>Google Geocoding</b>, Google-д зөвхөн plus code байгаа газарт <b>OpenStreetMap Nominatim</b>.
          Таны нэр илгээгдэхгүй. Хаяг манай мэдээллийн санд хадгалагдахгүй, бүртгэлтэй тань холбогдохгүй; ижил газрыг дахин хайхгүйн
          тулд сервер үр дүнг санах ойдоо нэг өдөр хүртэл байлгаад устгана.
        </p>

        <h2>Нийтийн тээвэр (Transitous)</h2>
        <p>
          Google-д нийтийн тээврийн мэдээлэл байхгүй, Эрдэнэтийн мэдээлэл хамаарахгүй газарт хөдлөх цаг ба чиглэлийг{" "}
          <b>Transitous</b> (transitous.org)-оос авна. Энэ нь нээлттэй хуваарь, шууд мэдээллээс бүтээсэн, олон нийтийн үнэгүй
          үйлчилгээ. Ойролцоох хөдлөх цагт зөвхөн ойролцоогоор 1 км хүртэл бөөрөнхийлсөн байршил, чиглэлд эхлэх ба очих цэг
          (ойролцоогоор 100 м хүртэл бөөрөнхийлсөн) болон таны хайсан газрын нэр илгээгдэнэ. Үр дүн серверийн санах ойд богино хугацаанд
          байгаад устана (хөдлөх цаг 30 секунд, чиглэл 5 минут, газрын нэр нэг өдөр).
        </p>
        <p>
          Хөдлөх цаг аль ч эх сурвалжид байхгүй газарт ойролцоох автобусны буудлын нэрийг (цагийн хуваарьгүй) <b>OpenStreetMap</b>-аас
          нийтийн Overpass серверүүдээр (overpass-api.de, overpass.kumi.systems, overpass.private.coffee) авна. Тэдэнд зөвхөн
          ойролцоогоор 1 км хүртэл бөөрөнхийлсөн бүс илгээгдэх ба үр дүн серверийн санах ойд нэг өдөр хадгалагдана.
        </p>

        <h2>Замын камер</h2>
        <p>
          Камерын самбар зөвхөн нийтэд нээлттэй камерыг харуулна. Эрдэнэтэд Орхон ТКХДТ-ийн шууд камерын хуудсыг (dedtuv.erdenet.mn)
          ачаална; Улаанбаатарт ubtraffic.mn сайтын холбоос өгнө. Бусад газарт Лондоны тээврийн газар (Transport for London), Сингапурын
          LTA, Хонконгийн тээврийн газар (Transport Department), Калифорнийн Caltrans, Шинэ Зеландын NZ Transport Agency Waka Kotahi-гийн
          нийтэлсэн замын камерын зураг, YouTube-ийн шууд дамжуулалт (youtube-nocookie.com) болон OpenStreetMap дээр тэмдэглэсэн вэб
          камерыг харуулна. Манай сервер нийтийн камерын жагсаалтыг таны байршилгүйгээр татна; YouTube болон OpenStreetMap-аас хайхдаа
          зөвхөн ойролцоогоор 10 км хүртэл бөөрөнхийлсөн бүсийг илгээнэ. Зураг, бичлэг, камерын хуудас таны хөтөчид нийтлэгчээс нь шууд
          ачаалагдах тул аль ч вэб сайтын адил тэд таны IP хаягийг харна. Aspire камерын зургийг бичиж хадгалдаггүй.
        </p>

        <h2>Aspire Desktop (таны компьютер)</h2>
        <p>
          Aspire Desktop туслах программыг суулгавал Aspire таны компьютер дээр апп эсвэл вэб хуудас нээх, текст бичих, текст файл
          хадгалах, маягт бөглөх боломжтой.
        </p>
        <ul>
          <li>
            <b>Холбох:</b> Тохиргоо 10 минут хүчинтэй, нэг удаагийн 10 тэмдэгтэй код өгнө. Туслах программ үүнийг төхөөрөмжийн
            токеноор солих ба токен таны компьютер дээр хадгалагдана. Манай мэдээллийн сан зөвхөн төхөөрөмжийн нэр (туслах программын
            илгээсэн компьютерийн нэр), холбосон ба сүүлд холбогдсон цаг, код ба токены SHA-256 хэшийг хадгална; код, токен өөрийг нь
            хадгалдаггүй.
          </li>
          <li>
            <b>Ажил:</b> таны хүссэн ажил (аппын нэр, холбоос, бичих текст, файлын нэр ба агуулга, маягтын утга) компьютер тань авах
            хүртэл манай мэдээллийн санд байна. Бүтэн ажлыг тэр компьютер дээр харуулах ба та &quot;Зөвшөөрөх&quot; (Allow) дарсны дараа
            л ажиллана (командын мөрийн туслах программд <code>y</code> гэж бичнэ). 5 минутын дотор зөвшөөрөөгүй ажил хүчингүй болно.
            Ажил дуусмагц (хийгдсэн, татгалзсан эсвэл алдаатай) агуулга нь шууд устна; хүчингүй болсон ажлын агуулга компьютер дахин
            холбогдох эсвэл шинэ ажил үүсэх үед устна. Ажлын бүх бичлэг богино үр дүнгийн хамт 24 цагийн дараа устна.
          </li>
          <li>Тохиргооноос компьютерээ хэзээ ч салгаж болно: токен нь ажиллахаа болиод, ажлууд нь устна.</li>
        </ul>

        <h2>Мэдээллийн сан (Supabase)</h2>
        <p>Supabase мэдээллийн сан (Сөүл, Өмнөд Солонгос) зөвхөн дараахыг хадгална:</p>
        <ul>
          <li>бот холболтууд (Telegram, Discord, Slack-ийн аль чат таны бүртгэлтэй холбогдсон);</li>
          <li>Aspire-ийг суулгасан Slack ажлын орчны (workspace) мэдээлэл;</li>
          <li>
            зөвхөн Telegram, Discord эсвэл Slack ботоо холбосон хэрэглэгчийн санах ой, сануулга, дадал, хичээлийн явцын хуулбар (бот таныг
            таньж ажиллахад хэрэгтэй);
          </li>
          <li>зөвхөн сануулгын мэдэгдэл асаасан хэрэглэгчийн хөтчийн мэдэгдлийн хаяг ба сануулгын (текст, цаг) хуулбар;</li>
          <li>
            компьютер холбосон бол Aspire Desktop: төхөөрөмжийн нэр, код ба токены хэш, ажлууд (дуусмагц агуулга нь устна, бичлэг 24
            цагийн дараа устна).
          </li>
        </ul>
        <p>
          Нууц түлхүүрүүдийг (Slack ботын токен) AES-256-GCM аргаар шифрлэж хадгална. Ботоо салгахад үүлэн дэх хуулбар устна.
          Тохиргоо дахь &quot;Үүлэн дэх мэдээллээ устгах&quot; товч ботын холбоос, холбосон компьютер болон хуулбарыг бүгдийг нь устгана. Холбосон
          компьютерийг Тохиргооноос салгахад төхөөрөмж ба түүний ажлууд устна.
        </p>

        <h2>Gmail</h2>
        <p>
          Gmail-ээ холбовол Aspire зөвхөн унших эрх (<code>gmail.readonly</code>) авна. Үүнийг зөвхөн өглөөний дуут мэдээнд болон таныг
          захидлынхаа талаар асуух үед сүүлийн захидлуудын илгээгч, гарчгийг уншихад ашиглана. Юу ч хадгалдаггүй. Захидал илгээх, устгах,
          өөрчлөх эрх байхгүй.
        </p>
        <p>
          Google API-аас хүлээн авсан мэдээллийг Aspire ашиглах болон бусад апп руу шилжүүлэхдээ{" "}
          <a href={GOOGLE_POLICY}>Google API Services User Data Policy</a>-ийн, түүний дотор Limited Use шаардлагыг мөрдөнө.
        </p>

        <h2>Google Calendar</h2>
        <p>
          Calendar-аа холбовол Aspire <code>calendar.events</code> эрх авна. Таныг асуухад өнөөдрийн эсвэл энэ долоо хоногийн үйл
          явдлыг уншина; шинэ үйл явдлыг зөвхөн та картан дээрх &quot;Нэмэх&quot; товчийг дарсны дараа нэмнэ. Юу ч хадгалдаггүй.
        </p>

        <h2>Дуу хоолой ба текст</h2>
        <p>
          <b>Дуу хоолой:</b> товчийг дарсны дараа л микрофон асна. Бичлэг Microsoft Azure Speech рүү очиж текст болно; бид бичлэгийг
          хадгалдаггүй. Дуугаар өгөх хариултыг ElevenLabs (боломжтой үед) эсвэл Microsoft Azure Speech үүсгэнэ; хариултын текстийг
          зөвхөн дуу болгохын тулд тэдэнд илгээх ба бид хадгалдаггүй. Үүсгэсэн дууг серверийн санах ойд 10 минут хүртэл л байлгана. <b>Текст:</b> таны асуулт, сүүлийн хэдэн яриа хариулт гаргахад
          хэрэглэгдэнэ; яриа манай мэдээллийн санд хадгалагдахгүй. <b>Техникийн мэдээлэл:</b> аюулгүй байдал, хэт ачааллаас хамгаалахын
          тулд IP хаягийг түр хугацаанд (нэг минут) санах ойд хадгална. Алдааны бүртгэлд таны асуултын агуулгыг бичдэггүй.
        </p>

        <h2>Таны өмнөөс илгээх ба ботууд</h2>
        <p>
          Aspire мессеж, нийтлэл, SMS, дуудлага, имэйлийг зөвхөн та дэлгэц дээрх баталгаажуулах товчийг дарсны дараа илгээнэ.
          Telegram, Discord, Slack дээрх Aspire бот зөвхөн өөрт нь хандсан чат дотор хариулна. Эдгээр платформ чатын агуулгыг өөрсдийн
          нөхцөлийн дагуу хадгална.
        </p>

        <h2>Гуравдагч талын үйлчилгээ</h2>
        <ul>
          <li>Clerk: бүртгэл, нэвтрэлт.</li>
          <li>Supabase: мэдээллийн сан (Сөүл, Өмнөд Солонгос).</li>
          <li>Vercel: сайтыг байршуулах.</li>
          <li>Anthropic Claude, DeepSeek, Google Gemini: хиймэл оюуны хариулт. Вэб хайлтыг Claude хийнэ.</li>
          <li>Зураг илгээвэл хариулахын тулд AI үйлчилгээ (Anthropic эсвэл Google) рүү нэг удаа илгээгдэнэ; Аспайр түүнийг хадгалахгүй, бүртгэхгүй.</li>
          <li>
            Сануулгын мэдэгдэл (Тохиргоонд асаасан үед): таны хөтчийн мэдэгдлийн хаяг болон сануулгууд (текст, цаг) Supabase-д хадгалагдана;
            сануулга таны хөтчийн мэдэгдлийн үйлчилгээгээр (Google, Mozilla эсвэл Apple) шифрлэгдэж очно. Унтраавал, гарвал эсвэл бүртгэлээ
            устгавал хаяг устна.
          </li>
          <li>Microsoft Azure Speech: яриа таних, дуугаар хариулах.</li>
          <li>ElevenLabs: дуугаар хариулах (хариултын текст).</li>
          <li>Google: Gmail API, Google Calendar API, нэвтрэлт. Apple: нэвтрэлт.</li>
          <li>YouTube (Google): таны хайх үг; тоглуулагч youtube-nocookie.com-оос ачаалагдана.</li>
          <li>Spotify: таны хайх үг; тоглуулагч open.spotify.com-оос ачаалагдах ба өөрийн cookie тавьж болно.</li>
          <li>Telegram, Discord, Slack: ботууд.</li>
          <li>Open-Meteo (цаг агаар, агаарын бохирдол), Wikipedia (мэдлэг), open.er-api.com (валютын ханш).</li>
          <li>
            Google Maps Platform: чиглэл, нийтийн тээвэр, ойролцоох газар, автобусны буудал ба такси, замын түгжрэл, цаг агаар, агаарын
            бохирдол, гудамжны хаяг (Geocoding).
          </li>
          <li>OpenStreetMap Nominatim: Google-д байхгүй үеийн гудамжны хаяг (~11 м хүртэл бөөрөнхийлсөн байршил).</li>
          <li>Transitous (transitous.org): нийтийн тээврийн хөдлөх цаг ба чиглэл.</li>
          <li>
            OpenStreetMap Overpass (overpass-api.de, overpass.kumi.systems, overpass.private.coffee): ойролцоох автобусны буудал ба вэб
            камер (ойролцоогоор 1-10 км хүртэл бөөрөнхийлсөн бүс).
          </li>
          <li>
            Замын камер нийтлэгчид: Transport for London, Сингапурын LTA, Хонконгийн тээврийн газар, Caltrans, NZ Transport Agency Waka
            Kotahi (камерын жагсаалт байршилгүй татагдана; зургийг таны хөтөч шууд ачаална). YouTube (Google): ойролцоогоор 10 км хүртэл
            бөөрөнхийлсөн бүс дэх шууд дамжуулалт.
          </li>
          <li>Орхон ТКХДТ (dedtuv.erdenet.mn): Эрдэнэт хотын автобусны шууд байршил, замын камер, зогсоол, шатахуун.</li>
          <li>OpenFreeMap / OpenStreetMap: газрын зургийн хавтан, таны хөтөч шууд ачаална (таны IP хаяг ба харж буй газрын хэсэг).</li>
          <li>newsdata.io: мэдээний гарчиг (зөвхөн улс, хэл, сэдэв эсвэл хайх үг).</li>
          <li>Wikimedia Commons: таны хотын нэрээр хайсан арын зураг.</li>
        </ul>
        <p>
          Эдгээр компани өөрсдийн нөхцөлийн дагуу мэдээллийг аюулгүй байдлын зорилгоор богино хугацаанд хадгалж болно.{" "}
          <b>
            Google-ийн үнэгүй багцыг ашиглах үед Google асуултыг өөрийн бүтээгдэхүүнийг сайжруулахад ашиглаж, хүн уншиж болзошгүй.
          </b>{" "}
          Тиймээс шаардлагагүй хувийн мэдээллээ бүү хэлээрэй. Open-Meteo, Wikipedia, open.er-api.com руу зөвхөн хотын нэр, хайх үг
          эсвэл бөөрөнхийлсөн байршил (~1 км) илгээгдэнэ; таны нэр илгээгдэхгүй.
        </p>

        <h2>Таны эрх</h2>
        <p>
          Монгол Улсын Хувь хүний мэдээлэл хамгаалах тухай хуулийн дагуу та өөрийн мэдээллийг үзэх, засуулах, устгуулах эрхтэй.
          Төхөөрөмж дээрх мэдээллээ &quot;Санах ой&quot; болон &quot;Тохиргоо&quot; хэсгээс харж, засаж, устгана. Үүлэн дэх мэдээллээ
          &quot;Үүлэн дэх мэдээллээ устгах&quot; товчоор, холбосон компьютерээ Тохиргооноос салгаж устгана. Бусад хүсэлт, тухайлбал бүртгэлээ бүрэн устгуулах бол холбогдоно уу:{" "}
          <Contact lang="mn" />.
        </p>

        <h2>Хүүхэд</h2>
        <p>13-аас доош насны хүүхэд эцэг эх, асран хамгаалагчийн хамт ашиглана уу.</p>
      </section>

      <hr />

      <section lang="en" id="en">
        <h2>Summary</h2>
        <ul>
          <li>
            You sign in to use Aspire. Sign-in is provided by <b>Clerk</b> (Google, Apple, or a 6-digit code sent to your email). Aspire
            keeps no passwords.
          </li>
          <li>
            By default your memory, reminders, routines, lessons, settings and Discord/Slack channel links stay <b>only on your device</b>.
          </li>
          <li>
            Only if you link a Telegram, Discord or Slack bot is a copy of them kept in our database (Supabase, Seoul, South Korea). If
            you turn on reminder notifications, only your reminders (text and time) are kept there.
          </li>
          <li>Gmail is read-only, and nothing from your mail is stored.</li>
          <li>Google Calendar: today&apos;s or this week&apos;s events are read when you ask; an event is added only after you press Add.</li>
          <li>Messages, posts, SMS, calls and emails are only sent after you tap a confirm button.</li>
          <li>Aspire Desktop asks on your computer before it does anything there: it acts only after you click Allow.</li>
          <li>No advertising trackers, and we never sell your data.</li>
        </ul>

        <h2>Your account</h2>
        <p>
          Sign-in is provided by Clerk. You sign in with Google, Apple, or a 6-digit code sent to your email. Clerk stores your account:
          your name, email address and, if you use Google or Apple, your profile photo. Aspire keeps no passwords. A cookie is used to
          keep you signed in.
        </p>

        <h2>What stays on your device</h2>
        <p>
          By default, your memory (things you ask the assistant to remember, for example your usual bus stop or a family member&apos;s
          phone number), reminders, routines, lesson progress, settings and Discord/Slack channel links are stored <b>only on your
          device</b>. They are sent along with a question so it can be answered, and we don&apos;t keep them. You can see and delete them
          any time in &quot;Memory&quot;. The assistant refuses to store passwords, card numbers or PIN codes. Only when you turn on
          location sharing in Settings, a rounded location (about 100 m) is sent with your questions and to Google Maps Platform, only to
          answer them, and is not stored. The link to the last background photo, its credit and its place name are kept on your device so
          the next open shows it at once (a Google photo for a day at most).
        </p>

        <h2>Your location and live conditions</h2>
        <p>
          To show the weather where you are (rain or snow), air quality, traffic, nearby stops, the next bus, taxis and a photo of your
          area, Aspire uses, in this order: your <b>device location</b>, only if you allow it (about 11 m); otherwise <b>the city you
          set</b>; otherwise your <b>approximate network location</b> (the city Vercel derives from your IP address). The precise
          position is used only to answer that request: it is never stored or linked to your account. It travels in the request body,
          so it is not kept in our request logs. For live conditions, Google Maps Platform and Open-Meteo receive only a position
          rounded to about 1 km (and the city name you typed, if any); when you ask for directions or nearby places with location
          sharing on, Google receives your position to about 100 m; distances to stops are worked
          out from the precise position on our server and then forgotten. Results stay in server memory for a short time and are then
          discarded: weather and the next bus 10 minutes, traffic 20 minutes, air quality 30 minutes, the forecast 3 hours, and stops,
          taxis, the city centre and the photo up to a day. The background photo is a photo of your whole city found on Wikimedia
          Commons by the city&apos;s name (no position is sent); its author and licence are always credited on screen. Live bus
          positions in Erdenet come from the open feed of <b>Орхон ТКХДТ</b>, the city&apos;s traffic camera service; your location
          is never sent to it. You can turn device location off at any time in Settings or in your browser settings.
        </p>
        <p>
          <b>The opening page</b> (the public home page you see before you sign in) shows the weather for your approximate area. It
          uses only your approximate network location (the city Vercel derives from your IP address): the position, rounded to about
          11 km, is sent to Open-Meteo to get the weather reading. It is not stored and not linked to you; the reading itself stays in
          server memory for up to 10 minutes and is then discarded. If your network location is not known, the page shows the weather
          in Erdenet instead.
        </p>

        <h2>Street address</h2>
        <p>
          When device location is on, the street and house number shown on screen are looked up from your position rounded to about
          11 m: first with <b>Google Geocoding</b> and, where Google only has a plus code, with <b>OpenStreetMap Nominatim</b>. Your
          name is never sent. The address is not stored in our database or linked to your account; our server keeps the result in
          memory for up to a day so the same spot is not looked up again, then discards it.
        </p>

        <h2>Public transport (Transitous)</h2>
        <p>
          Where Google has no public transport and Erdenet&apos;s own feed does not apply, departures and routes come from{" "}
          <b>Transitous</b> (transitous.org), a free, community-run service built from open timetable and real-time feeds. For
          departures near you it receives only your position rounded to about 1 km; for a route, its start and end rounded to about
          100 m and the place name you asked for. Results stay in server memory for a short time and are then discarded (departures
          30 seconds, routes 5 minutes, place names a day).
        </p>
        <p>
          Where no source has departures, nearby bus stops (names only, no times) come from <b>OpenStreetMap</b> through the public
          Overpass servers (overpass-api.de, overpass.kumi.systems, overpass.private.coffee). They receive only an area rounded to about
          1 km, and the results stay in server memory for a day.
        </p>

        <h2>Traffic cameras</h2>
        <p>
          The camera panel shows only public cameras. In Erdenet it embeds the live camera page of Орхон ТКХДТ (dedtuv.erdenet.mn); in
          Ulaanbaatar it links to ubtraffic.mn. Elsewhere it shows traffic camera pictures published by Transport for London,
          Singapore&apos;s Land Transport Authority, the Hong Kong Transport Department, Caltrans (California) and NZ Transport Agency Waka
          Kotahi, live streams on YouTube (youtube-nocookie.com) and webcams mapped on OpenStreetMap. Our server downloads the public camera
          lists without your position; to find YouTube streams and OpenStreetMap webcams it sends only an area rounded to about 10 km.
          Pictures, videos and camera pages load in your browser straight from their publishers, who see your IP address like any website.
          Aspire does not record or store camera images.
        </p>

        <h2>Aspire Desktop (your computer)</h2>
        <p>
          If you install the Aspire Desktop helper, Aspire can open an app or a web page, type text, save a text file or fill a form
          on your computer.
        </p>
        <ul>
          <li>
            <b>Pairing:</b> Settings gives you a one-time 10-character code that works for 10 minutes. The helper trades it for a
            device token, which stays on your computer. Our database keeps only the device name (the computer name the helper
            reports), when it was paired and last seen, and SHA-256 hashes of the code and the token, never the code or token
            themselves.
          </li>
          <li>
            <b>Jobs:</b> what you ask for (the app name, link, text to type, file name and content, or form values) waits in our
            database until your computer collects it. The full job is shown on that computer and runs only after you click Allow (in
            the command-line helper, type <code>y</code>). A job not allowed within 5 minutes expires. Its content is erased as soon
            as it finishes (done, refused or failed); an expired job&apos;s content is erased the next time the computer checks in
            or a job is queued. Every job record, with its short result, is deleted after 24 hours.
          </li>
          <li>You can unlink the computer in Settings at any time: its token stops working and its jobs are deleted.</li>
        </ul>

        <h2>Our database (Supabase)</h2>
        <p>Our Supabase database (Seoul, South Korea) stores only:</p>
        <ul>
          <li>bot links (which Telegram, Discord or Slack chat is linked to your account);</li>
          <li>Slack workspace installs (the workspaces where Aspire was added);</li>
          <li>
            only for users who link a Telegram, Discord or Slack bot: a synced copy of your memory, reminders, routines and lessons, so
            the bot can help you as you;
          </li>
          <li>only for users who turn on reminder notifications: their browser&apos;s push address and a copy of their reminders (text and time);</li>
          <li>
            only if you pair a computer with Aspire Desktop: its device name, hashed codes and token, and jobs (content erased once
            finished, records deleted after 24 hours).
          </li>
        </ul>
        <p>
          Secrets (Slack bot tokens) are encrypted with AES-256-GCM. Unlinking a bot removes the cloud copy. &quot;Delete my cloud
          data&quot; in Settings removes all bot links, paired computers and the synced copy. Unlinking a paired computer in Settings removes it and
          its jobs.
        </p>

        <h2>Gmail</h2>
        <p>
          If you connect Gmail, Aspire gets read-only access (<code>gmail.readonly</code>). It is used only to read the senders and
          subjects of your recent mail for the spoken morning briefing and when you ask about your mail. Nothing is stored. Aspire cannot
          send, delete or change your mail.
        </p>
        <p>
          Aspire&apos;s use and transfer of information received from Google APIs to any other app will adhere to{" "}
          <a href={GOOGLE_POLICY}>Google API Services User Data Policy</a>, including the Limited Use requirements.
        </p>

        <h2>Google Calendar</h2>
        <p>
          If you connect your calendar, Aspire gets the <code>calendar.events</code> scope. It reads today&apos;s or this week&apos;s
          events when you ask, and adds an event only after you press Add on the card. Nothing is stored.
        </p>

        <h2>Voice and text</h2>
        <p>
          <b>Voice:</b> the microphone turns on only after you press the button. The recording goes to Microsoft Azure Speech and is
          turned into text; we don&apos;t keep it. Spoken replies are made by ElevenLabs (when available) or Microsoft Azure Speech;
          the reply text is sent to them only to make the audio, and we do not keep it. The audio is held in server memory for up to
          10 minutes. <b>Text:</b> your question and the last
          few turns of the conversation are used to answer; conversations are not stored in our database. <b>Technical data:</b> your IP
          address is kept in memory for about one minute to protect the service from abuse. Error logs do not contain what you said.
        </p>

        <h2>Sending for you, and bots</h2>
        <p>
          Aspire only sends a message, post, SMS, call or email after you tap a confirm button on the screen. The Aspire bots on
          Telegram, Discord and Slack only reply in the chat that addressed them. Those platforms keep chat content under their own
          terms.
        </p>

        <h2>Third-party services</h2>
        <ul>
          <li>Clerk: accounts and sign-in.</li>
          <li>Supabase: database (Seoul, South Korea).</li>
          <li>Vercel: hosting.</li>
          <li>Anthropic Claude, DeepSeek, Google Gemini: AI answers. Web search is done through Claude.</li>
          <li>If you send a photo, it is sent once to the AI provider (Anthropic or Google) to answer you, and is not stored or logged by Aspire.</li>
          <li>
            Reminder notifications (only when you turn them on in Settings): your browser&apos;s push address and your reminders (text and
            time) are stored in Supabase, and reminders travel encrypted through your browser&apos;s push service (Google, Mozilla or Apple).
            Turning them off, signing out or deleting your data removes the address.
          </li>
          <li>Microsoft Azure Speech: voice recognition and spoken replies.</li>
          <li>ElevenLabs: spoken replies (the reply text).</li>
          <li>Google: Gmail API, Google Calendar API and sign-in. Apple: sign-in.</li>
          <li>YouTube (Google): your search words; the player loads from youtube-nocookie.com.</li>
          <li>Spotify: your search words; the player loads from open.spotify.com, which may set its own cookies.</li>
          <li>Telegram, Discord, Slack: bots.</li>
          <li>Open-Meteo (weather and air quality), Wikipedia (encyclopedia), open.er-api.com (exchange rates).</li>
          <li>
            Google Maps Platform: directions, public transport, nearby places, bus stops and taxis, traffic, weather, air quality and
            street address (Geocoding).
          </li>
          <li>OpenStreetMap Nominatim: street address where Google has none (a position rounded to about 11 m).</li>
          <li>Transitous (transitous.org): public transport departures and routes.</li>
          <li>
            OpenStreetMap Overpass (overpass-api.de, overpass.kumi.systems, overpass.private.coffee): nearby bus stops and webcams (an area
            rounded to about 1 to 10 km).
          </li>
          <li>
            Traffic camera publishers: Transport for London, Singapore&apos;s Land Transport Authority, the Hong Kong Transport Department,
            Caltrans and NZ Transport Agency Waka Kotahi (camera lists are fetched without your position; your browser loads the pictures).
            YouTube (Google): live streams in an area rounded to about 10 km.
          </li>
          <li>Орхон ТКХДТ (dedtuv.erdenet.mn): live bus positions, traffic cameras, parking and fuel in Erdenet.</li>
          <li>OpenFreeMap / OpenStreetMap: map tiles, loaded by your browser (your IP address and the map area you view).</li>
          <li>newsdata.io: headlines (only a country, language, topic or search words).</li>
          <li>Wikimedia Commons: the background photo, searched by your city&apos;s name.</li>
        </ul>
        <p>
          These providers may keep data briefly for safety and abuse monitoring under their own terms.{" "}
          <b>
            When we use Google&apos;s free tier, Google may use questions to improve its products, and people may review them.
          </b>{" "}
          So please don&apos;t share personal details you don&apos;t need to. Only a place name, search words or a rounded location (about
          1 km) are sent to Open-Meteo, Wikipedia and open.er-api.com, never your name.
        </p>

        <h2>Your rights</h2>
        <p>
          Under Mongolia&apos;s Law on Personal Data Protection you have the right to access, correct and delete your personal data. Data
          on your device can be viewed, changed and deleted in &quot;Memory&quot; and &quot;Settings&quot;. Cloud data is deleted with
          &quot;Delete my cloud data&quot;, and a paired computer with Unlink in Settings. For anything else, such as deleting your account, contact us: <Contact />.
        </p>

        <h2>Children</h2>
        <p>Children under 13 should use it with a parent or guardian.</p>
      </section>

      <hr />

      <section lang="zh-Hans" id="zh">
        <h2>摘要</h2>
        <ul>
          <li>登录由 Clerk 提供（Google、Apple 或发送到邮箱的 6 位验证码）。Aspire 不保存密码。</li>
          <li>默认情况下，您的记忆、提醒、流程、课程、设置以及 Discord/Slack 频道链接只保存在您的设备上。</li>
          <li>只有在您关联 Telegram、Discord 或 Slack 机器人时，才会在我们的数据库（Supabase，韩国首尔）中保存一份副本。开启提醒通知时，只保存您的提醒（内容和时间）。</li>
          <li>Gmail 为只读，不保存任何邮件内容。</li>
          <li>Google 日历：在您询问时读取今天或本周的日程；只有在您点击“添加”后才会添加日程，不保存任何内容。</li>
          <li>
            天气、空气质量、路况、车站、下一班车、出租车和背景照片：仅在您允许时使用设备的精确位置（约 11 米），否则使用您设置的城市，再否则使用网络大致位置。精确位置只用于当次请求，不会保存，也不会与您的账户关联。实时状况发送给
            Google 的位置约为 1 公里精度；开启位置共享并询问路线或附近地点时，Google 会收到约 100 米精度的位置。背景照片是按城市名在 Wikimedia Commons 上找到的城市照片，并注明作者；额尔登特的实时公交数据来自 Орхон ТКХДТ。
          </li>
          <li>
            登录前看到的首页会显示您所在大致区域的天气。这里只使用网络大致位置（Vercel 根据您的 IP 地址判断的城市）：只把约 11
            公里精度的位置发送给 Open-Meteo 以获取天气数据。该位置不会保存，也不会与您关联；天气数据在服务器内存中最多保留 10
            分钟。无法判断网络位置时，显示额尔登特的天气。
          </li>
          <li>
            公共交通数据来自 Transitous（附近发车只发送约 1 公里精度的位置，路线的起点和终点约 100 米精度）。街道地址由 Google Geocoding 或
            OpenStreetMap Nominatim 根据约 11 米精度的位置查询，不保存到数据库。新闻来自 newsdata.io。
          </li>
          <li>
            没有发车数据的地方，附近公交站（只有站名，没有时刻）来自 OpenStreetMap，经公共 Overpass 服务器（overpass-api.de、overpass.kumi.systems、
            overpass.private.coffee）查询，只发送约 1 公里精度的区域，结果在服务器内存中保留一天。
          </li>
          <li>
            摄像头面板只显示公开的摄像头：额尔登特的实时摄像头页面（Орхон ТКХДТ，dedtuv.erdenet.mn），乌兰巴托则提供 ubtraffic.mn 的链接；其他地方显示伦敦交通局（Transport
            for London）、新加坡陆路交通管理局（LTA）、香港运输署、加州交通局（Caltrans）和新西兰交通局（NZ Transport Agency Waka Kotahi）发布的交通摄像头画面、YouTube
            直播（youtube-nocookie.com）以及 OpenStreetMap 上标注的网络摄像头。我们的服务器下载公开的摄像头列表时不发送您的位置；查找 YouTube 直播和 OpenStreetMap
            摄像头时只发送约 10 公里精度的区域。画面和页面由您的浏览器直接从发布方加载，它们会看到您的 IP 地址。我们不保存摄像头图像。
          </li>
          <li>
            Aspire Desktop：配对电脑时我们只保存设备名称以及配对码和设备令牌的 SHA-256 哈希值。任务只有在您在电脑上点击“允许”（Allow）后才会执行，5
            分钟内未允许即失效；任务结束后内容立即删除，所有任务记录 24 小时后删除。可随时在设置中取消关联。
          </li>
          <li>
            语音回复由 ElevenLabs（可用时）或 Microsoft Azure Speech 生成；回复文本仅用于生成音频，我们不保存，音频在服务器内存中最多保留 10 分钟。
            YouTube（Google）和 Spotify 会收到您的搜索词；播放器分别从 youtube-nocookie.com 和 open.spotify.com 加载，后者可能设置自己的 Cookie。
          </li>
          <li>消息、短信、电话和邮件只有在您点击确认按钮后才会发送。没有广告追踪，我们绝不出售您的数据。</li>
        </ul>
        <p>
          联系方式：<Contact lang="zh" />。
        </p>
      </section>

      <hr />

      <section lang="ru" id="ru">
        <h2>Кратко</h2>
        <ul>
          <li>Вход обеспечивает Clerk (Google, Apple или 6-значный код на почту). Aspire не хранит пароли.</li>
          <li>
            По умолчанию ваша память, напоминания, сценарии, уроки, настройки и ссылки на каналы Discord/Slack хранятся только на вашем
            устройстве.
          </li>
          <li>
            Только если вы подключите бота Telegram, Discord или Slack, их копия хранится в нашей базе (Supabase, Сеул, Южная Корея). Если
            включить уведомления о напоминаниях, там хранятся только напоминания (текст и время).
          </li>
          <li>Доступ к Gmail только для чтения, содержимое писем не сохраняется.</li>
          <li>Google Календарь: события на сегодня или неделю читаются по вашему запросу; событие добавляется только после нажатия «Добавить». Ничего не сохраняется.</li>
          <li>
            Погода, качество воздуха, пробки, остановки, ближайший автобус, такси и фоновое фото: точное местоположение устройства (около
            11 м) используется только с вашего разрешения, иначе выбранный вами город, иначе приблизительное сетевое местоположение.
            Точная позиция нужна только для этого запроса, не хранится и не связывается с аккаунтом. Для текущих условий в Google
            передаётся позиция с точностью около 1 км; если при включённой передаче местоположения вы спрашиваете маршрут или места
            рядом, Google получает позицию с точностью около 100 м. Фоновое фото города находится на Wikimedia Commons по названию города
            и подписывается автором; данные об автобусах Эрдэнэта предоставляет Орхон ТКХДТ.
          </li>
          <li>
            Главная страница, которую вы видите до входа, показывает погоду для вашего примерного района. Для этого используется только
            приблизительное сетевое местоположение (город, который Vercel определяет по вашему IP-адресу): в Open-Meteo отправляется
            позиция, округлённая примерно до 11 км, чтобы получить данные о погоде. Она не хранится и не связывается с вами; сами
            данные о погоде остаются в памяти сервера не дольше 10 минут. Если сетевое местоположение неизвестно, показывается погода
            в Эрдэнэте.
          </li>
          <li>
            Общественный транспорт: Transitous (для ближайших отправлений позиция с точностью около 1 км, для маршрута начало и конец
            около 100 м). Адрес улицы определяют Google Geocoding или OpenStreetMap Nominatim по позиции с точностью около 11 м; в базе
            он не хранится. Новости: newsdata.io.
          </li>
          <li>
            Там, где ни у одного источника нет отправлений, ближайшие остановки (только названия, без расписания) берутся из OpenStreetMap
            через общедоступные серверы Overpass (overpass-api.de, overpass.kumi.systems, overpass.private.coffee); им отправляется только
            район, округлённый примерно до 1 км, результаты хранятся в памяти сервера один день.
          </li>
          <li>
            Панель камер показывает только общедоступные камеры: страницу камер Эрдэнэта (Орхон ТКХДТ, dedtuv.erdenet.mn), ссылку на
            ubtraffic.mn для Улан-Батора, а в других местах снимки дорожных камер Transport for London, LTA Сингапура, Транспортного
            департамента Гонконга, Caltrans (Калифорния) и NZ Transport Agency Waka Kotahi (Новая Зеландия), прямые трансляции YouTube
            (youtube-nocookie.com) и веб-камеры, отмеченные в OpenStreetMap. Наш сервер загружает общедоступные списки камер без вашего
            местоположения; для поиска трансляций YouTube и камер OpenStreetMap отправляется только район, округлённый примерно до 10 км.
            Изображения и страницы загружает ваш браузер напрямую у их издателей, которые видят ваш IP-адрес. Кадры камер мы не храним.
          </li>
          <li>
            Aspire Desktop: при подключении компьютера мы храним только имя устройства и SHA-256-хеши кода и токена. Задание выполняется
            только после того, как вы нажмёте «Разрешить» (Allow) на своём компьютере, и истекает через 5 минут; его содержимое
            удаляется сразу после завершения, все записи о заданиях удаляются через 24 часа. Отключить компьютер можно в настройках.
          </li>
          <li>
            Голосовые ответы создаёт ElevenLabs (если доступен) или Microsoft Azure Speech; текст ответа отправляется им только для
            озвучивания, мы его не храним, аудио остаётся в памяти сервера не дольше 10 минут. YouTube (Google) и Spotify получают ваш
            поисковый запрос; плееры загружаются с youtube-nocookie.com и open.spotify.com (последний может ставить свои cookie).
          </li>
          <li>Сообщения, SMS, звонки и письма отправляются только после подтверждения. Никаких рекламных трекеров, данные не продаются.</li>
        </ul>
        <p>
          Контакт: <Contact lang="ru" />.
        </p>
      </section>

      <hr />

      <section lang="de" id="de">
        <h2>Kurz gesagt</h2>
        <ul>
          <li>Die Anmeldung erfolgt über Clerk (Google, Apple oder ein 6-stelliger Code per E-Mail). Aspire speichert keine Passwörter.</li>
          <li>
            Gedächtnis, Erinnerungen, Abläufe, Lektionen, Einstellungen und Discord/Slack-Kanallinks bleiben standardmäßig nur auf Ihrem
            Gerät.
          </li>
          <li>
            Nur wenn Sie einen Telegram-, Discord- oder Slack-Bot verknüpfen, liegt eine Kopie in unserer Datenbank (Supabase, Seoul, Südkorea).
            Mit eingeschalteten Erinnerungsmitteilungen werden dort nur Ihre Erinnerungen (Text und Uhrzeit) gespeichert.
          </li>
          <li>Gmail ist nur lesbar; aus Ihren E-Mails wird nichts gespeichert.</li>
          <li>Google Kalender: Termine von heute oder dieser Woche werden gelesen, wenn Sie fragen; ein Termin wird erst nach Tippen auf „Hinzufügen“ eingetragen. Nichts wird gespeichert.</li>
          <li>
            Wetter, Luftqualität, Verkehr, Haltestellen, nächster Bus, Taxis und Hintergrundfoto: Der genaue Gerätestandort (etwa 11 m)
            wird nur mit Ihrer Erlaubnis genutzt, sonst die von Ihnen gewählte Stadt, sonst ein ungefährer Netzwerkstandort. Der genaue
            Standort dient nur der jeweiligen Anfrage, wird nicht gespeichert und nicht mit Ihrem Konto verknüpft. Für die Live-Lage geht
            an Google ein auf etwa 1 km gerundeter Standort; fragen Sie bei eingeschalteter Standortfreigabe nach Routen oder Orten in der
            Nähe, erhält Google Ihren Standort auf etwa 100 m genau. Das Hintergrundfoto der Stadt wird auf Wikimedia Commons über den
            Stadtnamen gefunden, mit Nennung des Urhebers; die Live-Busdaten für Erdenet liefert Орхон ТКХДТ.
          </li>
          <li>
            Die Startseite, die Sie vor der Anmeldung sehen, zeigt das Wetter für Ihre ungefähre Umgebung. Dafür wird nur der ungefähre
            Netzwerkstandort genutzt (die Stadt, die Vercel aus Ihrer IP-Adresse ableitet): Der auf etwa 11 km gerundete Standort geht
            an Open-Meteo, um die Wetterdaten abzurufen. Er wird nicht gespeichert und nicht mit Ihnen verknüpft; die Wetterdaten selbst
            bleiben höchstens 10 Minuten im Serverspeicher. Ist der Netzwerkstandort unbekannt, zeigt die Seite das Wetter in Erdenet.
          </li>
          <li>
            Nahverkehr: Transitous (für Abfahrten in der Nähe ein auf etwa 1 km gerundeter Standort, für Routen Start und Ziel auf etwa
            100 m). Die Straßenadresse ermitteln Google Geocoding oder OpenStreetMap Nominatim aus einem auf etwa 11 m gerundeten
            Standort; sie wird nicht in der Datenbank gespeichert. Nachrichten: newsdata.io.
          </li>
          <li>
            Wo keine Quelle Abfahrten hat, kommen Haltestellen in der Nähe (nur Namen, keine Zeiten) aus OpenStreetMap über öffentliche
            Overpass-Server (overpass-api.de, overpass.kumi.systems, overpass.private.coffee); sie erhalten nur ein auf etwa 1 km gerundetes
            Gebiet, die Ergebnisse bleiben einen Tag im Serverspeicher.
          </li>
          <li>
            Das Kamerafenster zeigt nur öffentliche Kameras: die Kameraseite für Erdenet (Орхон ТКХДТ, dedtuv.erdenet.mn), einen Link zu
            ubtraffic.mn für Ulaanbaatar und anderswo Verkehrskamerabilder von Transport for London, der Land Transport Authority Singapur,
            dem Transport Department Hongkong, Caltrans (Kalifornien) und NZ Transport Agency Waka Kotahi (Neuseeland), Livestreams auf
            YouTube (youtube-nocookie.com) sowie in OpenStreetMap eingetragene Webcams. Unser Server lädt die öffentlichen Kameralisten ohne
            Ihren Standort; für die Suche nach YouTube-Livestreams und OpenStreetMap-Webcams wird nur ein auf etwa 10 km gerundetes Gebiet
            gesendet. Bilder und Seiten lädt Ihr Browser direkt bei den Anbietern, die dabei Ihre IP-Adresse sehen. Kamerabilder speichern
            wir nicht.
          </li>
          <li>
            Aspire Desktop: Beim Koppeln eines Computers speichern wir nur den Gerätenamen und SHA-256-Hashes von Code und Token. Ein
            Auftrag läuft erst, wenn Sie auf dem Computer „Erlauben“ (Allow) klicken, und verfällt nach 5 Minuten; sein Inhalt wird
            nach Abschluss sofort gelöscht, alle Auftragsdatensätze nach 24 Stunden. Die Kopplung lässt sich in den Einstellungen
            jederzeit aufheben.
          </li>
          <li>
            Gesprochene Antworten erzeugt ElevenLabs (wenn verfügbar) oder Microsoft Azure Speech; der Antworttext geht nur zur
            Vertonung dorthin, wir speichern ihn nicht, das Audio bleibt höchstens 10 Minuten im Serverspeicher. YouTube (Google) und
            Spotify erhalten Ihre Suchwörter; die Player laden von youtube-nocookie.com bzw. open.spotify.com (letzterer kann eigene
            Cookies setzen).
          </li>
          <li>Nachrichten, SMS, Anrufe und E-Mails gehen erst nach Ihrer Bestätigung raus. Keine Werbe-Tracker, kein Verkauf Ihrer Daten.</li>
        </ul>
        <p>
          Kontakt: <Contact lang="de" />.
        </p>
      </section>
    </LegalPage>
  );
}
