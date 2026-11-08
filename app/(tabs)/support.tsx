import { ScrollView, Text, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, X } from 'lucide-react-native';
import { useApp } from '@/components/AppProvider';

const FONT = 'Poppins-Regular';
const FONT_MED = 'Poppins-Medium';
const FONT_SEMI = 'Poppins-SemiBold';
const FONT_BOLD = 'Poppins-Bold';
const FONT_XB = 'Poppins-ExtraBold';

export default function Support() {
  const router = useRouter();
  const { accentForeground, isDark } = useApp();

  const pageBg = accentForeground;

  const goToProfile = () => {
    router.replace('/profile');
  };

  const C = isDark
    ? {
        card: '#121212',
        border: '#000000',
        text: '#FFFFFF',
        muted: '#A1A1AA',
        divider: '#262626',
      }
    : {
        card: '#FFFFFF',
        border: '#000000',
        text: '#000000',
        muted: '#52525B',
        divider: '#E4E4E7',
      };

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: pageBg,
      }}
    >
      {/* HEADER */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 10,
          borderBottomWidth: 2,
          borderBottomColor: '#000000',
          backgroundColor: pageBg,
        }}
      >
        <Pressable
          onPress={goToProfile}
          hitSlop={10}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <ChevronLeft
            color="#000000"
            size={24}
            strokeWidth={2.5}
          />
          <Text
            style={{
              color: '#000000',
              fontFamily: FONT_SEMI,
              fontSize: 14,
            }}
          >
            Profile
          </Text>
        </Pressable>

        <Text
          style={{
            color: '#000000',
            fontFamily: FONT_XB,
            fontSize: 20,
            letterSpacing: 1,
            textAlign: 'center',
            flex: 1,
          }}
        >
          SUPPORT
        </Text>

        <Pressable
          onPress={goToProfile}
          hitSlop={10}
          style={{
            padding: 4,
          }}
        >
          <X
            color="#000000"
            size={22}
            strokeWidth={2.5}
          />
        </Pressable>
      </View>

      {/* CONTENT */}
      <ScrollView
        style={{
          flex: 1,
        }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          padding: 22,
          paddingBottom: 40,
        }}
      >
        <div style={{ position: 'relative', width: '100%', maxWidth: 800, alignSelf: 'center', marginBottom: 16 }}>
          <div style={{ position: 'absolute', top: 4, left: 4, right: -7, bottom: -7, backgroundColor: '#000000', borderRadius: 16 }} />
          <View
            style={{
              backgroundColor: C.card,
              borderColor: '#000000',
              borderWidth: 3,
              borderRadius: 16,
              padding: 22,
            }}
          >
            <Text
              style={{
                color: C.text,
                fontFamily: FONT_BOLD,
                fontSize: 24,
                marginBottom: 12,
              }}
            >
              My Sidekick Support
            </Text>

            <Text
              style={{
                color: C.muted,
                fontFamily: FONT,
                fontSize: 14,
                lineHeight: 22,
                marginBottom: 24,
              }}
            >
              Welcome to My Sidekick support. We're here to help you get the most
              out of the app.
            </Text>

            <Text
              style={{
                color: C.text,
                fontFamily: FONT_BOLD,
                fontSize: 18,
                marginBottom: 8,
              }}
            >
              Need Help?
            </Text>

            <Text
              style={{
                color: C.muted,
                fontFamily: FONT,
                fontSize: 14,
                lineHeight: 22,
                marginBottom: 20,
              }}
            >
              If you have a question or experience a problem with My Sidekick,
              please contact us by email and describe the issue.
            </Text>

            <Text
              style={{
                color: C.text,
                fontFamily: FONT_SEMI,
                fontSize: 15,
                marginBottom: 24,
              }}
            >
              Support: theallapplication@gmail.com
            </Text>

            <Text
              style={{
                color: C.text,
                fontFamily: FONT_BOLD,
                fontSize: 18,
                marginBottom: 8,
              }}
            >
              About My Sidekick
            </Text>

            <Text
              style={{
                color: C.muted,
                fontFamily: FONT,
                fontSize: 14,
                lineHeight: 22,
                marginBottom: 20,
              }}
            >
              My Sidekick brings everyday organization into one place. Use it to
              plan your days, track habits, manage finances, organize lists and
              reminders, save resources, and support your wellbeing.
            </Text>

            <Text
              style={{
                color: C.text,
                fontFamily: FONT_BOLD,
                fontSize: 18,
                marginBottom: 8,
              }}
            >
              Account Help
            </Text>

            <Text
              style={{
                color: C.muted,
                fontFamily: FONT,
                fontSize: 14,
                lineHeight: 22,
                marginBottom: 12,
              }}
            >
              To create an account, open My Sidekick and follow the sign-up
              process.
            </Text>

            <Text
              style={{
                color: C.muted,
                fontFamily: FONT,
                fontSize: 14,
                lineHeight: 22,
                marginBottom: 20,
              }}
            >
              If you have forgotten your password, use the password reset option
              on the sign-in screen.
            </Text>

            <Text
              style={{
                color: C.text,
                fontFamily: FONT_BOLD,
                fontSize: 18,
                marginBottom: 8,
              }}
            >
              Request Data Deletion
            </Text>

            <Text
              style={{
                color: C.muted,
                fontFamily: FONT,
                fontSize: 14,
                lineHeight: 22,
                marginBottom: 20,
              }}
            >
              If you would like to request deletion of your My Sidekick account
              or personal data, please email us at theallapplication@gmail.com.
              Include the email address associated with your account and clearly
              state that you are requesting data deletion.
            </Text>

            <Text
              style={{
                color: C.text,
                fontFamily: FONT_BOLD,
                fontSize: 18,
                marginBottom: 8,
              }}
            >
              Report Harm, Scams, or Safety Concerns
            </Text>

            <Text
              style={{
                color: C.muted,
                fontFamily: FONT,
                fontSize: 14,
                lineHeight: 22,
                marginBottom: 24,
              }}
            >
              If you experience or become aware of harm, scams, abuse,
              harassment, fraudulent activity, or other safety concerns
              involving My Sidekick, please report it to us at
              theallapplication@gmail.com. Please describe what happened and
              provide any relevant information that can help us investigate the
              report.
            </Text>

            <Text
              style={{
                color: C.muted,
                fontFamily: FONT,
                fontSize: 12,
                marginTop: 10,
              }}
            >
              © 2026 My Sidekick. All rights reserved.
            </Text>
          </View>
        </div>
      </ScrollView>
    </SafeAreaView>
  );
}