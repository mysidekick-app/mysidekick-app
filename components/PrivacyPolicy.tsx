import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

const FONT = 'Poppins-Regular';
const FONT_MED = 'Poppins-Medium';
const FONT_SEMI = 'Poppins-SemiBold';
const FONT_BOLD = 'Poppins-Bold';
const FONT_XB = 'Poppins-ExtraBold';

type PrivacyPolicyProps = {
  textColor: string;
  mutedColor: string;
  borderColor: string;
  accentColor?: string;
  accentWash?: string;
};

type SectionProps = {
  number: string;
  title: string;
  children: React.ReactNode;
  textColor: string;
  mutedColor: string;
  borderColor: string;
};

function Section({
  number,
  title,
  children,
  textColor,
  mutedColor,
  borderColor,
}: SectionProps) {
  return (
    <View style={[styles.section, { borderBottomColor: borderColor }]}>
      <View style={styles.sectionHeading}>
        <Text style={[styles.number, { color: mutedColor }]}>{number}</Text>
        <Text style={[styles.sectionTitle, { color: textColor }]}>{title}</Text>
      </View>
      <Text style={[styles.body, { color: mutedColor }]}>{children}</Text>
    </View>
  );
}

export default function PrivacyPolicy({
  textColor,
  mutedColor,
  borderColor,
  accentColor = '#000000',
  accentWash = 'rgba(0,0,0,0.08)',
}: PrivacyPolicyProps) {
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled
      keyboardShouldPersistTaps="handled"
      bounces
    >
      <View
        style={[
          styles.introCard,
          {
            backgroundColor: accentColor,
            borderColor: accentColor,
          },
        ]}
      >
        <View style={styles.introContent}>
          <Text style={[styles.introTitle, { color: '#FFFFFF' }]}>
            Your privacy matters
          </Text>
          <Text style={[styles.introText, { color: '#FFFFFF' }]}>
            Sidekick is designed to help you organize your life, build habits,
            manage your plans, understand your progress, and stay connected
            with people you choose to collaborate with.
          </Text>
        </View>
      </View>

      <Section
        number="01"
        title="About This Privacy Policy"
        textColor={textColor}
        mutedColor={mutedColor}
        borderColor={borderColor}
      >
        This Privacy Policy explains how Sidekick collects, uses, stores, protects,
        and shares information when you use the Sidekick app and related services.
        It is intended to reflect generally accepted privacy principles and the
        privacy laws that may apply to Sidekick and its users. Sidekick may update
        this policy as the service, technology, or applicable legal requirements
        change.
      </Section>

      <Section
        number="02"
        title="Information We Collect"
        textColor={textColor}
        mutedColor={mutedColor}
        borderColor={borderColor}
      >
        Depending on the features you use, we may collect account information such
        as your name, username, profile information, authentication information,
        selected Sidekick avatar, and contact information. We may also collect
        information you enter into Planner, Habits, Reminders, Lists, Finance,
        Plants, Bookmarks, Well-being, Games, chat, and other features. Technical
        information such as device, app, connection, and diagnostic information may
        also be processed when necessary to operate, secure, and improve the app.
      </Section>

      <Section
        number="03"
        title="How We Use Your Information"
        textColor={textColor}
        mutedColor={mutedColor}
        borderColor={borderColor}
      >
        We use information to provide and personalize Sidekick features, save and
        synchronize your information, maintain your account, support collaboration,
        provide reminders and insights, protect the service, troubleshoot problems,
        understand how features are used, improve the app, and communicate important
        service information. We may also use aggregated or de-identified information
        for analytics, planning, research, and product improvement where appropriate.
      </Section>

      <Section
        number="04"
        title="Your Personal Insights"
        textColor={textColor}
        mutedColor={mutedColor}
        borderColor={borderColor}
      >
        Sidekick may use information from features you choose to use to provide
        summaries, patterns, progress information, suggestions, and other personal
        insights. These insights are intended to help you understand and organize
        your own activities. They are not a diagnosis, medical assessment, financial
        recommendation, or other professional advice unless Sidekick expressly states
        otherwise.
      </Section>

      <Section
        number="05"
        title="Sensitive and Personal Information"
        textColor={textColor}
        mutedColor={mutedColor}
        borderColor={borderColor}
      >
        Some information you choose to enter may be personal or sensitive in nature,
        including financial information, journal entries, well-being information,
        private conversations, or information about other people. Please consider
        carefully what you enter into the app. Sidekick does not require you to enter
        information that is unnecessary for the feature you are using, and you should
        avoid entering highly sensitive information unless you are comfortable with it
        being processed to provide that feature.
      </Section>

      <Section
        number="06"
        title="Chat and Artificial Intelligence Features"
        textColor={textColor}
        mutedColor={mutedColor}
        borderColor={borderColor}
      >
        Some Sidekick conversations or AI-powered features may process messages,
        prompts, and relevant app information through artificial intelligence or
        technology providers that help us deliver those features. Information sent to
        an AI provider may be processed according to that provider's terms and privacy
        practices. Do not enter information into an AI feature that you do not want
        processed for that purpose. AI responses may be inaccurate and should not be
        treated as professional medical, legal, financial, or other specialist advice.
      </Section>

      <Section
        number="07"
        title="Social Features, Accountability and Visibility"
        textColor={textColor}
        mutedColor={mutedColor}
        borderColor={borderColor}
      >
        Sidekick may include profiles, groups, collaboration, direct messages,
        accountability features, activity indicators, or other social functionality.
        Information you choose to make visible through these features may be seen by
        the people or groups you interact with. Before sharing information, consider
        who will be able to see it. You are responsible for using social features
        thoughtfully and for respecting other people's privacy.
      </Section>

      <Section
        number="08"
        title="Children and Young People"
        textColor={textColor}
        mutedColor={mutedColor}
        borderColor={borderColor}
      >
        Sidekick is not intended to encourage unsafe online activity or to exploit
        children. However, accounts, usernames, profiles, chats, collaboration, and
        social features can create ordinary online safety risks for younger users.
        Where applicable law requires parental or guardian consent for a young person
        to use a service, that requirement should be followed. Parents and guardians
        should supervise younger users and help them understand what information is
        appropriate to share online. We may take additional steps where required by
        applicable law concerning children's information.
      </Section>

      <Section
        number="09"
        title="Why Active Status and Accountability Features Exist"
        textColor={textColor}
        mutedColor={mutedColor}
        borderColor={borderColor}
      >
        Some Sidekick features are designed around accountability, consistency, and
        collaboration. For that reason, certain activity or presence information may
        be visible to people you have chosen to connect or collaborate with. These
        features are part of the product experience and may not always include an
        option to appear completely offline. Parents or guardians may also use
        appropriate supervision when younger users are involved.
      </Section>

      <Section
        number="10"
        title="When We May Share Information"
        textColor={textColor}
        mutedColor={mutedColor}
        borderColor={borderColor}
      >
        We may share or allow access to information when necessary to provide the
        service, such as with hosting, authentication, database, infrastructure,
        analytics, communications, security, or AI service providers. These providers
        should only receive information reasonably necessary for the services they
        provide. We may also disclose information when required by law, legal process,
        to protect users or the service, to investigate abuse or security incidents,
        or as part of a business transfer such as a merger, acquisition, financing,
        or sale of assets, subject to applicable law.
      </Section>

      <Section
        number="11"
        title="International Data Transfers"
        textColor={textColor}
        mutedColor={mutedColor}
        borderColor={borderColor}
      >
        Sidekick and its service providers may process or store information in
        countries other than the country where you live. Where information is
        transferred internationally, we will seek to use appropriate safeguards and
        comply with applicable data protection requirements.
      </Section>

      <Section
        number="12"
        title="Data Security"
        textColor={textColor}
        mutedColor={mutedColor}
        borderColor={borderColor}
      >
        We use reasonable technical and organizational measures designed to protect
        information against unauthorized access, loss, misuse, alteration, or
        disclosure. No internet service can guarantee absolute security. You should
        also protect your account credentials and notify us if you believe your
        account has been compromised.
      </Section>

      <Section
        number="13"
        title="How Long We Keep Information"
        textColor={textColor}
        mutedColor={mutedColor}
        borderColor={borderColor}
      >
        We generally keep information for as long as reasonably necessary to provide
        the service, maintain security, meet legitimate operational needs, resolve
        disputes, enforce agreements, and comply with legal obligations. Retention
        periods may vary by the type of information and the purpose for which it is
        processed. Information that is no longer needed may be deleted or securely
        de-identified where appropriate.
      </Section>

      <Section
        number="14"
        title="Your Privacy Rights"
        textColor={textColor}
        mutedColor={mutedColor}
        borderColor={borderColor}
      >
        Depending on where you live and the laws that apply to you, you may have
        rights relating to your personal information, including rights to access,
        correct, delete, restrict, object to, or obtain a copy of certain information.
        You may also have rights concerning consent and certain automated processing.
        Requests can be made using the contact details provided below, subject to
        applicable legal limitations and verification requirements.
      </Section>

      <Section
        number="15"
        title="Account Deletion"
        textColor={textColor}
        mutedColor={mutedColor}
        borderColor={borderColor}
      >
        You may request deletion of your Sidekick account and associated personal
        information. Some information may need to be retained where required by law,
        needed to prevent fraud or abuse, or necessary to establish, exercise, or
        defend legal claims. Deleting an account may also remove access to app data,
        so you should export or otherwise preserve information you need before
        requesting deletion where that option is available.
      </Section>

      <Section
        number="16"
        title="Cookies and Similar Technologies"
        textColor={textColor}
        mutedColor={mutedColor}
        borderColor={borderColor}
      >
        Sidekick or its web-based services may use cookies, local storage, device
        identifiers, or similar technologies where necessary for authentication,
        preferences, security, analytics, or service functionality. The technologies
        used may differ between the mobile app and web services. Where consent is
        legally required, we will seek it as appropriate.
      </Section>

      <Section
        number="17"
        title="Third-Party Services"
        textColor={textColor}
        mutedColor={mutedColor}
        borderColor={borderColor}
      >
        Sidekick may rely on third-party services for hosting, authentication,
        databases, payments, analytics, AI, communications, app distribution, or
        other infrastructure. Those providers may process information on our behalf
        or independently under their own terms. We encourage you to review the privacy
        information of services that you connect to or use through Sidekick.
      </Section>

      <Section
        number="18"
        title="No Sale of Personal Information"
        textColor={textColor}
        mutedColor={mutedColor}
        borderColor={borderColor}
      >
        Sidekick does not intend to sell your personal information or share it with
        unrelated third parties for their own direct marketing purposes. This does
        not prevent the limited processing or disclosure necessary to operate the
        service, comply with law, protect the platform, or provide features you have
        requested.
      </Section>

      <Section
        number="19"
        title="Changes to This Privacy Policy"
        textColor={textColor}
        mutedColor={mutedColor}
        borderColor={borderColor}
      >
        We may update this Privacy Policy from time to time. When changes are made,
        we may update the policy within the app and, where appropriate, provide a
        more prominent notice. Your continued use of Sidekick after an updated policy
        becomes effective means you acknowledge the updated policy to the extent
        permitted by applicable law.
      </Section>

      <Section
        number="20"
        title="Contact Us"
        textColor={textColor}
        mutedColor={mutedColor}
        borderColor={borderColor}
      >
        If you have a privacy question, request, concern, or complaint, contact us at
        [YOUR PRIVACY EMAIL]. Please include enough information for us to understand
        and respond to your request. This policy should be reviewed and finalized for
        the specific Sidekick operating entity, jurisdictions, service providers, and
        legal requirements before public launch.
      </Section>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  content: {
    paddingBottom: 28,
  },
  introCard: {
    borderWidth: 1,
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 24,
  },
  introContent: {
    padding: 18,
  },
  introTitle: {
    fontFamily: FONT_XB,
    fontSize: 17,
    marginBottom: 8,
  },
  introText: {
    fontFamily: FONT_MED,
    fontSize: 12,
    lineHeight: 19,
  },
  section: {
    paddingBottom: 18,
    marginBottom: 18,
    borderBottomWidth: 1,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
  },
  number: {
    fontFamily: FONT_BOLD,
    fontSize: 10,
    lineHeight: 22,
    width: 24,
  },
  sectionTitle: {
    flex: 1,
    fontFamily: FONT_BOLD,
    fontSize: 14,
    lineHeight: 22,
  },
  body: {
    fontFamily: FONT,
    fontSize: 12,
    lineHeight: 19,
  },
});
