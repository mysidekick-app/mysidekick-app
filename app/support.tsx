import { ScrollView, Text, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';

export default function Support() {
  const router = useRouter();

  return (
    <ScrollView
      style={{
        flex: 1,
        backgroundColor: '#000000',
      }}
      contentContainerStyle={{
        padding: 60,
        paddingTop: 60,
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
        {/* BACK TO PROFILE */}
        <Pressable
          onPress={() => router.replace('/profile')}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            alignSelf: 'flex-start',
            marginBottom: 25,
            paddingVertical: 6,
            paddingRight: 10,
          }}
          hitSlop={10}
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
            paddingTop: 20,
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
  );
}