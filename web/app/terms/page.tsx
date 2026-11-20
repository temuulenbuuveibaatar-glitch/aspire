import type { Metadata } from "next";
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
        <h2>Анхаарах зүйл</h2>
        <ul>
          <li>
            <b>Автобусны цаг</b> одоогоор жишээ (sample) мэдээлэл бөгөөд бодит цагийн хуваарьтай таарахгүй байж болно. Чухал аялалын
            өмнө тээврийн байгууллагаас лавлана уу.
          </li>
          <li>
            Хиймэл оюуны хариулт заримдаа буруу байж болно. Эрүүл мэнд, санхүү, хуулийн асуудлаар мэргэжлийн хүнээс зөвлөгөө аваарай.
          </li>
          <li>Яаралтай тусламж: түргэн тусламж 103, гал команд 101, цагдаа 102.</li>
          <li>Нууц үг, картын дугаар, ПИН код зэрэг мэдээллээ хэзээ ч бүү хэлээрэй.</li>
        </ul>
        <h2>Зөв хэрэглээ</h2>
        <p>Үйлчилгээг хууль бус зорилгоор, бусдад хор хөнөөл учруулах, эсвэл системийг хэт ачаалах байдлаар ашиглахыг хориглоно.</p>
        <h2>Хариуцлага</h2>
        <p>
          Хуулиар зөвшөөрөгдсөн хэмжээнд багийн гишүүд энэ үйлчилгээг ашигласнаас үүдэх хохирлыг хариуцахгүй. Холбоо барих: <Contact />.
        </p>
      </section>

      <hr />

      <section lang="en">
        <h2>What this is</h2>
        <p>
          Aspire is a demo service built for the {SITE.event}. It is free and provided &quot;as is&quot;, without warranties of any
          kind.
        </p>
        <h2>Please note</h2>
        <ul>
          <li>
            <b>Bus times</b> are currently sample data and may not match the real schedule. Check with the transport operator before
            an important trip.
          </li>
          <li>AI answers can be wrong. For health, money or legal matters, ask a qualified professional.</li>
          <li>Emergencies in Mongolia: ambulance 103, fire 101, police 102.</li>
          <li>Never say passwords, bank card numbers or PIN codes to the assistant.</li>
        </ul>
        <h2>Acceptable use</h2>
        <p>Don&apos;t use the service for anything illegal, to harm others, or to overload or attack the system.</p>
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
