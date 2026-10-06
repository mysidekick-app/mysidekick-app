import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/components/AuthProvider';

const C={bg:'#000000',card:'#151515',text:'#FFFFFF',muted:'#A7A7A7',border:'#303030',success:'#70D39A',error:'#FF7777',button:'#252525',buttonBorder:'#333333'};

export default function ConfirmEmailScreen(){
  const {user,resendConfirmationEmail,loading}=useAuth();
  const params=useLocalSearchParams<{email?:string}>();
  const [email,setEmail]=useState(typeof params.email==='string'?params.email:user?.email??'');
  const [resent,setResent]=useState(false);
  const [error,setError]=useState<string|null>(null);

  useEffect(()=>{if(!email&&user?.email)setEmail(user.email)},[email,user?.email]);

  const resend=async()=>{
    setError(null);setResent(false);
    if(!email.trim()){setError('Please enter your email address again.');return;}
    const result=await resendConfirmationEmail(email);
    if(result.error){setError(result.error);return;}
    setResent(true);
  };

  return <SafeAreaView style={s.safe}><View style={s.center}><View style={s.card}>
    <Image source={require('@/assets/sidekick.png')} style={s.logo}/>
    <Text style={s.title}>Confirm your email</Text>
    <Text style={s.subtitle}>We sent a confirmation link to</Text>
    <Text style={s.email}>{email||'your email address'}</Text>
    <Text style={s.body}>Open the email and tap the confirmation link to activate your My Sidekick account.</Text>
    {resent?<Text style={s.success}>Confirmation email sent again.</Text>:null}
    {error?<Text style={s.error}>{error}</Text>:null}
    <Pressable onPress={resend} disabled={loading} style={[s.primary,loading&&s.disabled]}>
      {loading?<ActivityIndicator color="#FFFFFF"/>:<Text style={s.primaryText}>Resend confirmation email</Text>}
    </Pressable>
    <Link href="/login" asChild><Pressable style={s.back}><Text style={s.backText}>Back to Sign In</Text></Pressable></Link>
  </View></View></SafeAreaView>
}
const s=StyleSheet.create({
 safe:{flex:1,backgroundColor:C.bg},center:{flex:1,justifyContent:'center',alignItems:'center',padding:18},
 card:{width:'100%',maxWidth:430,backgroundColor:C.card,borderRadius:30,borderWidth:1,borderColor:'#242424',padding:28,alignItems:'center'},
 logo:{width:92,height:92,borderRadius:46,marginBottom:22},title:{color:C.text,fontFamily:'Poppins-Bold',fontSize:22,textAlign:'center'},
 subtitle:{color:C.muted,fontFamily:'Poppins-Regular',fontSize:12.5,marginTop:8,textAlign:'center'},email:{color:C.text,fontFamily:'Poppins-SemiBold',fontSize:13,marginTop:4,textAlign:'center'},
 body:{color:C.muted,fontFamily:'Poppins-Regular',fontSize:12,lineHeight:19,marginTop:18,textAlign:'center'},success:{color:C.success,fontFamily:'Poppins-Regular',fontSize:11.5,marginTop:14,textAlign:'center'},
 error:{color:C.error,fontFamily:'Poppins-Regular',fontSize:11.5,marginTop:14,textAlign:'center'},primary:{width:'100%',minHeight:52,borderRadius:15,backgroundColor:C.button,borderWidth:1,borderColor:C.buttonBorder,alignItems:'center',justifyContent:'center',marginTop:22},
 primaryText:{color:C.text,fontFamily:'Poppins-Bold',fontSize:12.5},back:{paddingVertical:10,marginTop:8},backText:{color:C.muted,fontFamily:'Poppins-SemiBold',fontSize:11.5},disabled:{opacity:.55}
});
