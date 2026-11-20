import type { Metadata } from "next";
import LegalPage, { Contact } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Нууцлалын бодлого · Privacy Policy — Эмээ товч" };

export default function Privacy() {
  return (
    <LegalPage title="Нууцлалын бодлого · Privacy Policy">
      <section lang="mn">
        <h2>Товчхондоо</h2>
        <ul>
          <li>Бид бүртгэл, нэр, утасны дугаар, байршил асуудаггүй.</li>
          <li>Таны дуу хоолойг зөвхөн асуултыг тань текст болгоход ашиглана. Бид дуу бичлэг хадгалдаггүй.</li>
          <li>Асуултын текстийг хариулт гаргахын тулд хиймэл оюуны үйлчилгээ рүү (Anthropic Claude, Google Gemini эсвэл өөрийн сервер дээрх загвар) илгээнэ.</li>
          <li>Бид cookie болон зар сурталчилгааны хянах хэрэгсэл ашигладаггүй. Таны мэдээллийг худалдахгүй.</li>
        </ul>

        <h2>Ямар мэдээлэл боловсруулдаг вэ</h2>
        <p>
          <b>Дуу хоолой:</b> товчийг дарсны дараа л микрофон асна. Бичлэг яриа таних үйлчилгээ рүү (Google Gemini эсвэл манай өөрийн
          сервер) очиж текст болно; бид бичлэгийг хадгалдаггүй. <b>Текст:</b> таны асуулт, сүүлийн хэдэн яриа хариулт гаргахад хэрэглэгдэнэ; энэ нь зөвхөн таны
          төхөөрөмжид байх ба хуудсыг хаахад арилна. <b>Техникийн мэдээлэл:</b> аюулгүй байдал, хэт ачааллаас хамгаалахын тулд IP
          хаягийг түр хугацаанд (нэг минут) санах ойд хадгална. Алдааны бүртгэлд таны асуултын агуулгыг бичдэггүй.
        </p>

        <h2>Гуравдагч талын үйлчилгээ</h2>
        <p>
          Хариулт гаргахад Anthropic (Claude), Google (Gemini) эсвэл өөрсдийн сервер дээрх нээлттэй загвар ашиглана. Вэб хайлт
          хийх үед асуултын хэсэг хайлтын үйлчилгээ рүү очно. Дуу хоолойг таних, дуугаар хариулахад Google Gemini ашиглана. Эдгээр
          компани өөрсдийн нөхцөлийн дагуу мэдээллийг аюулгүй байдлын зорилгоор богино хугацаанд хадгалж болно.{" "}
          <b>
            Google-ийн үнэгүй багцыг ашиглах үед Google асуулт, бичлэгийг өөрийн бүтээгдэхүүнийг сайжруулахад ашиглаж, хүн уншиж
            болзошгүй.
          </b>{" "}
          Тиймээс нэр, хаяг, утасны дугаар зэрэг хувийн мэдээллээ бүү хэлээрэй. Сайтыг Vercel дээр байршуулдаг.
        </p>

        <h2>Таны эрх</h2>
        <p>
          Монгол Улсын Хувь хүний мэдээлэл хамгаалах тухай хуулийн дагуу та өөрийн мэдээллийн талаар асуух, устгуулах эрхтэй. Бид
          таны тухай мэдээлэл хадгалдаггүй ч асуулт байвал холбогдоно уу: <Contact />.
        </p>

        <h2>Хүүхэд</h2>
        <p>13-аас доош насны хүүхэд эцэг эх, асран хамгаалагчийн хамт ашиглана уу.</p>
      </section>

      <hr />

      <section lang="en">
        <h2>Summary</h2>
        <ul>
          <li>No accounts. We don&apos;t ask for your name, phone number or location.</li>
          <li>Your voice is used only to turn your question into text. We don&apos;t store recordings.</li>
          <li>
            The text of your question is sent to an AI service (Anthropic Claude, Google Gemini, or a model on our own server) to
            produce the answer.
          </li>
          <li>No cookies, no advertising trackers, and we never sell your data.</li>
        </ul>

        <h2>What we process</h2>
        <p>
          <b>Voice:</b> the microphone turns on only after you press the button. The recording goes to a speech service (Google Gemini or
          our own server) and is turned into text; we don&apos;t keep it. <b>Text:</b> your question and the last few turns of the conversation are used to
          answer; the conversation lives only on your device and disappears when you close the page. <b>Technical data:</b> your IP
          address is kept in memory for about one minute to protect the service from abuse. Error logs do not contain what you said.
        </p>

        <h2>Third-party services</h2>
        <p>
          Answers come from Anthropic (Claude), Google (Gemini) or an open model on our own server. When a web search is needed,
          part of your question is sent to a search service. Speech recognition and the spoken answers use Google Gemini. These
          providers may keep data briefly for safety and abuse monitoring under their own terms.{" "}
          <b>
            When we use Google&apos;s free tier, Google may use questions and recordings to improve its products, and people may
            review them.
          </b>{" "}
          So please don&apos;t say personal details such as your name, address or phone number. The site is hosted on Vercel.
        </p>

        <h2>Your rights</h2>
        <p>
          Under Mongolia&apos;s Law on Personal Data Protection you can ask about or request deletion of your personal data. We don&apos;t
          keep personal data, but you can contact us: <Contact />.
        </p>

        <h2>Children</h2>
        <p>Children under 13 should use it with a parent or guardian.</p>
      </section>
    </LegalPage>
  );
}
