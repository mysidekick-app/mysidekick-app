import { ScrollView, Text, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, X } from 'lucide-react-native';

export default function Support() {
  const router = useRouter();

  const goToProfile = () => {
    router.replace('/profile');
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#000000',
      }}
    >
      {/* TOP NAVIGATION */}
      <View
        style={{
          position: 'absolute',
          top: 50,
          left: 30,
          right: 30,
          zIndex: 10,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* BACK ARROW */}
        <Pressable
          onPress={goToProfile}
          hitSlop={10}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 20,
          }}
        >
          <ChevronLeft
            color="#FFFFFF"
            size={28}
            strokeWidth={2.2}
          />

          <Text
            style={{
              color: '#FFFFFF',
              fontSize: 16,
              fontWeight: '600',
            }}
          >
            Profile
          </Text>
        </Pressable>

        {/* CLOSE X */}
        <Pressable
          onPress={goToProfile}
          hitSlop={10}
          style={{
            padding: 6,
          }}
        >
          <X
            color="#FFFFFF"
            size={25}
            strokeWidth={2.2}
          />
        </Pressable>
      </View>

      <ScrollView
        style={{
          flex: 1,
        }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          padding: 30,
          paddingTop: 85,
          paddingBottom: 60,
        }}
      >
        <View
          style={{
            maxWidth: 800,
            width: '100%',
            alignSelf: 'center',
          }}
        >
          <Text
            style={{
              color: '#FFFFFF',
              fontSize: 36,
              fontWeight: '700',
              marginBottom: 15,
            }}
          >
            My Sidekick Support
          </Text>

          <Text
            style={{
              color: '#CCCCCC',
              fontSize: 18,
              lineHeight: 28,
              marginBottom: 30,
            }}
          >
            Welcome to My Sidekick support. We're here to help you get the most
            out of the app.
          </Text>

          <Text
            style={{
              color: '#FFFFFF',
              fontSize: 22,
              fontWeight: '700',
              marginBottom: 10,
            }}
          >
            Need Help?
          </Text>

          <Text
            style={{
              color: '#CCCCCC',
              fontSize: 16,
              lineHeight: 26,
              marginBottom: 25,
            }}
          >
            If you have a question or experience a problem with My Sidekick,
            please contact us by email and describe the issue.
          </Text>

          <Text
            style={{
              color: '#FFFFFF',
              fontSize: 17,
              fontWeight: '600',
              marginBottom: 30,
            }}
          >
            Support: theallapplication@gmail.com
          </Text>

          <Text
            style={{
              color: '#FFFFFF',
              fontSize: 22,
              fontWeight: '700',
              marginBottom: 10,
            }}
          >
            About My Sidekick
          </Text>

          <Text
            style={{
              color: '#CCCCCC',
              fontSize: 16,
              lineHeight: 26,
              marginBottom: 25,
            }}
          >
            My Sidekick brings everyday organization into one place. Use it to
            plan your days, track habits, manage finances, organize lists and
            reminders, save resources, and support your wellbeing.
          </Text>

          <Text
            style={{
              color: '#FFFFFF',
              fontSize: 22,
              fontWeight: '700',
              marginBottom: 10,
            }}
          >
            Account Help
          </Text>

          <Text
            style={{
              color: '#CCCCCC',
              fontSize: 16,
              lineHeight: 26,
              marginBottom: 15,
            }}
          >
            To create an account, open My Sidekick and follow the sign-up
            process.
          </Text>

          <Text
            style={{
              color: '#CCCCCC',
              fontSize: 16,
              lineHeight: 26,
              marginBottom: 25,
            }}
          >
            If you have forgotten your password, use the password reset option
            on the sign-in screen.
          </Text>

          {/* DATA DELETION */}
          <Text
            style={{
              color: '#FFFFFF',
              fontSize: 22,
              fontWeight: '700',
              marginBottom: 10,
            }}
          >
            Request Data Deletion
          </Text>

          <Text
            style={{
              color: '#CCCCCC',
              fontSize: 16,
              lineHeight: 26,
              marginBottom: 25,
            }}
          >
            If you would like to request deletion of your My Sidekick account
            or personal data, please email us at theallapplication@gmail.com.
            Include the email address associated with your account and clearly
            state that you are requesting data deletion.
          </Text>

          {/* SAFETY CONCERNS */}
          <Text
            style={{
              color: '#FFFFFF',
              fontSize: 22,
              fontWeight: '700',
              marginBottom: 10,
            }}
          >
            Report Harm, Scams, or Safety Concerns
          </Text>

          <Text
            style={{
              color: '#CCCCCC',
              fontSize: 16,
              lineHeight: 26,
              marginBottom: 25,
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
              color: '#777777',
              fontSize: 14,
              marginTop: 30,
            }}
          >
            © 2026 My Sidekick. All rights reserved.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}