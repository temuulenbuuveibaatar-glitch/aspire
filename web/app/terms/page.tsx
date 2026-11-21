import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { Contact, LangJump } from "@/components/LegalPage";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Үйлчилгээний нөхцөл · Terms of Use — Aspire" };

export default function Terms() {
  return (
    <LegalPage title="Үйлчилгээний нөхцөл · Terms of Use">
      <LangJump />
      <section lang="mn" id="mn">
        <h2>Энэ юу вэ</h2>
        <p>
          Aspire бол {SITE.event}-д зориулан бүтээсэн туршилтын (demo) үйлчилгээ юм. Үнэ төлбөргүй, &quot;байгаа хэвээр нь&quot;
          санал болгож байна.
        </p>
        <h2>Бүртгэл</h2>
        <p>
          Ашиглахын тулд Clerk-ээр (Google, Apple эсвэл имэйлийн 6 оронтой код) нэвтэрнэ. Бүртгэлээ өөрөө хамгаалж, нэвтрэх кодоо
          бусдад бүү өгөөрэй. Мэдээллийг хэрхэн ашигладгийг <Link href="/privacy">Нууцлалын бодлого</Link>-оос үзнэ үү.
        </p>
        <h2>Анхаарах зүйл</h2>
        <ul>
          <li>
            <b>Автобус, нийтийн тээврийн цаг</b> Google Maps-аас ирдэг бөгөөд бүрэн бус байж болно; Эрдэнэт хотын хуваарь жишээ (sample)
            мэдээлэл. Чухал аялалын өмнө тээврийн байгууллагаас лавлана уу.
          </li>
          <li>
            Хиймэл оюуны хариулт заримдаа буруу байж болно. Aspire эмнэлгийн болон хуулийн зөвлөгөө өгөхгүй. Эрүүл мэнд, санхүү, хуулийн
            асуудлаар мэргэжлийн хүнээс зөвлөгөө аваарай.
          </li>
          <li>
            <b>Яаралтай үед</b> Aspire-ээс асуулгүй өөрийн улсын яаралтай тусламжийн дугаар руу шууд залгана уу (Монголд: түргэн
            тусламж 103, гал команд 101, цагдаа 102; ихэнх улсад 112).
          </li>
          <li>
            <b>Залилангаас болгоомжил.</b> Aspire болон түүний ботууд хэзээ ч нууц үг, нэвтрэх код, картын дугаар, ПИН код асуухгүй,
            мөнгө шилжүүлэхийг шаардахгүй. Aspire-ийн нэрээр ийм зүйл асуувал бүү хариул.
          </li>
          <li>
            Мессеж, нийтлэл, SMS, дуудлага, имэйл зөвхөн таныг баталгаажуулах товч дарсны дараа илгээгдэнэ. Илгээхээсээ өмнө хүлээн
            авагч болон текстийг шалгаарай; илгээсэн зүйлийг та хариуцна.
          </li>
        </ul>
        <h2>Зөв хэрэглээ</h2>
        <p>
          Үйлчилгээг хууль бус зорилгоор, бусдад хор хөнөөл учруулах, спам илгээх, эсвэл системийг хэт ачаалах байдлаар ашиглахыг
          хориглоно.
        </p>
        <h2>Хариуцлага</h2>
        <p>
          Хуулиар зөвшөөрөгдсөн хэмжээнд багийн гишүүд энэ үйлчилгээг ашигласнаас үүдэх хохирлыг хариуцахгүй. Холбоо барих: <Contact lang="mn" />.
        </p>
        <h2>Нээлттэй эх</h2>
        <p>
          Эх код MIT лицензтэй. Гуравдагч талын загвар, сан өөрсдийн лицензтэй; OmniVoice дуу хоолойн загварыг зөвхөн арилжааны бус
          зорилгоор ашиглана.
        </p>
      </section>

      <hr />

      <section lang="en" id="en">
        <h2>What this is</h2>
        <p>
          Aspire is a demo service built for the {SITE.event}. It is free and provided &quot;as is&quot;, without warranties of any
          kind.
        </p>
        <h2>Your account</h2>
        <p>
          You sign in with Clerk (Google, Apple, or a 6-digit email code). Keep your account safe and never share your sign-in code.
          How your data is used is explained in the <Link href="/privacy">Privacy Policy</Link>.
        </p>
        <h2>Please note</h2>
        <ul>
          <li>
            <b>Bus and transit times</b> come from Google Maps and may be incomplete; the Erdenet timetable is sample data. Check with
            the transport operator before an important trip.
          </li>
          <li>
            AI answers can be wrong. Aspire does not give medical or legal advice. For health, money or legal matters, ask a qualified
            professional.
          </li>
          <li>
            <b>In an emergency</b>, call your local emergency number directly instead of asking Aspire (112 in Europe and most
            countries, 911 in the Americas, 999 in the UK, 000 in Australia; in Mongolia 103 ambulance, 101 fire, 102 police).
          </li>
          <li>
            <b>Watch out for scams.</b> Aspire and its bots will never ask for your password, sign-in code, card number or PIN, or ask you
            to send money. If anyone asks for these in Aspire&apos;s name, don&apos;t answer.
          </li>
          <li>
            Messages, posts, SMS, calls and emails are only sent after you tap a confirm button. Check the recipient and the text before
            you send; you are responsible for what you send.
          </li>
        </ul>
        <h2>Acceptable use</h2>
        <p>Don&apos;t use the service for anything illegal, to harm others, to send spam, or to overload or attack the system.</p>
        <h2>Liability</h2>
        <p>
          To the extent permitted by law, the team is not liable for any loss arising from use of the service. Contact: <Contact />.
        </p>
        <h2>Open source</h2>
        <p>
          The source code is published under the MIT License. Third-party models and libraries keep their own licenses; the
          OmniVoice voice model is licensed for non-commercial use only.
        </p>
      </section>

      <hr />

      <section lang="zh-Hans" id="zh">
        <h2>请注意</h2>
        <ul>
          <li>Aspire 是为 {SITE.event} 制作的免费演示服务，按“现状”提供。</li>
          <li>公交和公共交通时间来自 Google 地图，可能不完整；额尔登特的时刻表为示例数据。重要出行前请向运营方确认。</li>
          <li>AI 的回答可能有误。Aspire 不提供医疗或法律建议。</li>
          <li>
            <b>紧急情况</b>请直接拨打当地急救电话，不要询问 Aspire（欧洲及多数国家 112，美洲 911，英国 999，澳大利亚 000；中国 120 急救、119
            火警、110 报警；蒙古 103 急救、101 火警、102 报警）。
          </li>
          <li>Aspire 及其机器人绝不会索要密码、登录验证码、卡号或 PIN，也不会要求您转账。</li>
          <li>消息、短信、电话和邮件只有在您点击确认按钮后才会发送。</li>
        </ul>
        <p>
          联系方式：<Contact lang="zh" />。
        </p>
      </section>

      <hr />

      <section lang="ru" id="ru">
        <h2>Обратите внимание</h2>
        <ul>
          <li>Aspire — бесплатный демонстрационный сервис, созданный для {SITE.event}, предоставляется «как есть».</li>
          <li>
            Время автобусов и транспорта берётся из Google Maps и может быть неполным; расписание Эрдэнэта — пример. Перед важной поездкой
            уточните у перевозчика.
          </li>
          <li>Ответы ИИ могут быть ошибочными. Aspire не даёт медицинских и юридических советов.</li>
          <li>
            <b>В экстренной ситуации</b> звоните в местную службу спасения напрямую, а не спрашивайте Aspire (112 в Европе и большинстве
            стран, 911 в Америке, 999 в Великобритании, 000 в Австралии; в Монголии 103 скорая, 101 пожарная, 102 полиция).
          </li>
          <li>Aspire и его боты никогда не просят пароль, код входа, номер карты или PIN и не просят перевести деньги.</li>
          <li>Сообщения, SMS, звонки и письма отправляются только после нажатия кнопки подтверждения.</li>
        </ul>
        <p>
          Контакт: <Contact lang="ru" />.
        </p>
      </section>

      <hr />

      <section lang="de" id="de">
        <h2>Bitte beachten</h2>
        <ul>
          <li>Aspire ist ein kostenloser Demo-Dienst für den {SITE.event} und wird „wie besehen“ bereitgestellt.</li>
          <li>
            Bus- und Verkehrszeiten stammen von Google Maps und können unvollständig sein; der Fahrplan von Erdenet ist ein Beispiel. Prüfen
            Sie vor einer wichtigen Fahrt beim Verkehrsunternehmen nach.
          </li>
          <li>KI-Antworten können falsch sein. Aspire gibt keine medizinische oder rechtliche Beratung.</li>
          <li>
            <b>Im Notfall</b> rufen Sie direkt die örtliche Notrufnummer an, statt Aspire zu fragen (112 in Europa und den meisten Ländern,
            911 in Amerika, 999 im Vereinigten Königreich, 000 in Australien; in der Mongolei 103 Rettungsdienst, 101 Feuerwehr, 102
            Polizei).
          </li>
          <li>Aspire und seine Bots fragen nie nach Passwort, Anmeldecode, Kartennummer oder PIN und fordern nie zu Überweisungen auf.</li>
          <li>Nachrichten, SMS, Anrufe und E-Mails werden erst gesendet, wenn Sie eine Bestätigungstaste tippen.</li>
        </ul>
        <p>
          Kontakt: <Contact lang="de" />.
        </p>
      </section>
    </LegalPage>
  );
}
