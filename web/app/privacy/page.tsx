import type { Metadata } from "next";
import LegalPage, { Contact } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Нууцлалын бодлого · Privacy Policy — Aspire" };

const GOOGLE_POLICY = "https://developers.google.com/terms/api-services-user-data-policy";

export default function Privacy() {
  return (
    <LegalPage title="Нууцлалын бодлого · Privacy Policy">
      <section lang="mn">
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
            хадгалагдана.
          </li>
          <li>Gmail-ийг зөвхөн уншина, захидлын мэдээллийг хадгалдаггүй.</li>
          <li>Мессеж, нийтлэл, SMS, дуудлага, имэйлийг зөвхөн таныг баталгаажуулах товч дарсны дараа илгээнэ.</li>
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
          бөгөөд хадгалагдахгүй.
        </p>

        <h2>Мэдээллийн сан (Supabase)</h2>
        <p>Supabase мэдээллийн сан (Сөүл, Өмнөд Солонгос) зөвхөн дараахыг хадгална:</p>
        <ul>
          <li>бот холболтууд (Telegram, Discord, Slack-ийн аль чат таны бүртгэлтэй холбогдсон);</li>
          <li>Aspire-ийг суулгасан Slack ажлын орчны (workspace) мэдээлэл;</li>
          <li>
            зөвхөн Telegram, Discord эсвэл Slack ботоо холбосон хэрэглэгчийн санах ой, сануулга, дадал, хичээлийн явцын хуулбар (бот таныг
            таньж ажиллахад хэрэгтэй).
          </li>
        </ul>
        <p>
          Нууц түлхүүрүүдийг (Slack ботын токен) AES-256-GCM аргаар шифрлэж хадгална. Ботоо салгахад үүлэн дэх хуулбар устна.
          Тохиргоо дахь &quot;Үүлэн дэх мэдээллээ устгах&quot; товч бүгдийг нь устгана.
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

        <h2>Дуу хоолой ба текст</h2>
        <p>
          <b>Дуу хоолой:</b> товчийг дарсны дараа л микрофон асна. Бичлэг Microsoft Azure Speech рүү очиж текст болно; бид бичлэгийг
          хадгалдаггүй. Дуугаар өгөх хариултыг мөн Azure Speech үүсгэнэ. <b>Текст:</b> таны асуулт, сүүлийн хэдэн яриа хариулт гаргахад
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
          <li>Microsoft Azure Speech: яриа таних, дуугаар хариулах.</li>
          <li>Google: Gmail API, нэвтрэлт. Apple: нэвтрэлт.</li>
          <li>Telegram, Discord, Slack: ботууд.</li>
          <li>Open-Meteo (цаг агаар, агаарын бохирдол), Wikipedia (мэдлэг), open.er-api.com (валютын ханш).</li>
          <li>Google Maps Platform: чиглэл, нийтийн тээвэр, ойролцоох газар, цаг агаар, агаарын бохирдол.</li>
        </ul>
        <p>
          Эдгээр компани өөрсдийн нөхцөлийн дагуу мэдээллийг аюулгүй байдлын зорилгоор богино хугацаанд хадгалж болно.{" "}
          <b>
            Google-ийн үнэгүй багцыг ашиглах үед Google асуултыг өөрийн бүтээгдэхүүнийг сайжруулахад ашиглаж, хүн уншиж болзошгүй.
          </b>{" "}
          Тиймээс шаардлагагүй хувийн мэдээллээ бүү хэлээрэй. Open-Meteo, Wikipedia, open.er-api.com руу зөвхөн хотын нэр, хайх үг
          илгээгдэнэ; таны нэр илгээгдэхгүй.
        </p>

        <h2>Таны эрх</h2>
        <p>
          Монгол Улсын Хувь хүний мэдээлэл хамгаалах тухай хуулийн дагуу та өөрийн мэдээллийг үзэх, засуулах, устгуулах эрхтэй.
          Төхөөрөмж дээрх мэдээллээ &quot;Санах ой&quot; болон &quot;Тохиргоо&quot; хэсгээс харж, засаж, устгана. Үүлэн дэх мэдээллээ
          &quot;Үүлэн дэх мэдээллээ устгах&quot; товчоор устгана. Бусад хүсэлт, тухайлбал бүртгэлээ бүрэн устгуулах бол холбогдоно уу:{" "}
          <Contact />.
        </p>

        <h2>Хүүхэд</h2>
        <p>13-аас доош насны хүүхэд эцэг эх, асран хамгаалагчийн хамт ашиглана уу.</p>
      </section>

      <hr />

      <section lang="en">
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
            Only if you link a Telegram, Discord or Slack bot is a copy of them kept in our database (Supabase, Seoul, South Korea).
          </li>
          <li>Gmail is read-only, and nothing from your mail is stored.</li>
          <li>Messages, posts, SMS, calls and emails are only sent after you tap a confirm button.</li>
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
          answer them, and is not stored.
        </p>

        <h2>Our database (Supabase)</h2>
        <p>Our Supabase database (Seoul, South Korea) stores only:</p>
        <ul>
          <li>bot links (which Telegram, Discord or Slack chat is linked to your account);</li>
          <li>Slack workspace installs (the workspaces where Aspire was added);</li>
          <li>
            only for users who link a Telegram, Discord or Slack bot: a synced copy of your memory, reminders, routines and lessons, so
            the bot can help you as you.
          </li>
        </ul>
        <p>
          Secrets (Slack bot tokens) are encrypted with AES-256-GCM. Unlinking a bot removes the cloud copy. &quot;Delete my cloud
          data&quot; in Settings removes all of it.
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

        <h2>Voice and text</h2>
        <p>
          <b>Voice:</b> the microphone turns on only after you press the button. The recording goes to Microsoft Azure Speech and is
          turned into text; we don&apos;t keep it. Spoken replies are also made by Azure Speech. <b>Text:</b> your question and the last
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
          <li>Microsoft Azure Speech: voice recognition and spoken replies.</li>
          <li>Google: Gmail API and sign-in. Apple: sign-in.</li>
          <li>Telegram, Discord, Slack: bots.</li>
          <li>Open-Meteo (weather and air quality), Wikipedia (encyclopedia), open.er-api.com (exchange rates).</li>
          <li>Google Maps Platform: directions, public transport, nearby places, weather and air quality.</li>
        </ul>
        <p>
          These providers may keep data briefly for safety and abuse monitoring under their own terms.{" "}
          <b>
            When we use Google&apos;s free tier, Google may use questions to improve its products, and people may review them.
          </b>{" "}
          So please don&apos;t share personal details you don&apos;t need to. Only a place name or search words are sent to Open-Meteo,
          Wikipedia and open.er-api.com, never your name.
        </p>

        <h2>Your rights</h2>
        <p>
          Under Mongolia&apos;s Law on Personal Data Protection you have the right to access, correct and delete your personal data. Data
          on your device can be viewed, changed and deleted in &quot;Memory&quot; and &quot;Settings&quot;. Cloud data is deleted with
          &quot;Delete my cloud data&quot;. For anything else, such as deleting your account, contact us: <Contact />.
        </p>

        <h2>Children</h2>
        <p>Children under 13 should use it with a parent or guardian.</p>
      </section>
    </LegalPage>
  );
}
