import type { Metadata } from "next";
import Link from "next/link";
import LegalPage, { Contact } from "@/components/LegalPage";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Үйлчилгээний нөхцөл · Terms of Use — Aspire" };

export default function Terms() {
  return (
    <LegalPage title="Үйлчилгээний нөхцөл · Terms of Use">
      <section lang="mn">
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
            <b>Автобусны цаг</b> одоогоор жишээ (sample) мэдээлэл бөгөөд бодит цагийн хуваарьтай таарахгүй байж болно. Чухал аялалын
            өмнө тээврийн байгууллагаас лавлана уу.
          </li>
          <li>
            Хиймэл оюуны хариулт заримдаа буруу байж болно. Aspire эмнэлгийн болон хуулийн зөвлөгөө өгөхгүй. Эрүүл мэнд, санхүү, хуулийн
            асуудлаар мэргэжлийн хүнээс зөвлөгөө аваарай.
          </li>
          <li>
            <b>Яаралтай үед</b> Aspire-ээс асуулгүй шууд залгана уу: түргэн тусламж 103, гал команд 101, цагдаа 102.
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
          Хуулиар зөвшөөрөгдсөн хэмжээнд багийн гишүүд энэ үйлчилгээг ашигласнаас үүдэх хохирлыг хариуцахгүй. Холбоо барих: <Contact />.
        </p>
        <h2>Нээлттэй эх</h2>
        <p>
          Эх код MIT лицензтэй. Гуравдагч талын загвар, сан өөрсдийн лицензтэй; OmniVoice дуу хоолойн загварыг зөвхөн арилжааны бус
          зорилгоор ашиглана.
        </p>
      </section>

      <hr />

      <section lang="en">
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
            <b>Bus times</b> are currently sample data and may not match the real schedule. Check with the transport operator before
            an important trip.
          </li>
          <li>
            AI answers can be wrong. Aspire does not give medical or legal advice. For health, money or legal matters, ask a qualified
            professional.
          </li>
          <li>
            <b>In an emergency</b>, call directly instead of asking Aspire: ambulance 103, fire 101, police 102.
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
    </LegalPage>
  );
}
