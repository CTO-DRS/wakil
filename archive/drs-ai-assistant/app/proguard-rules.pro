# JNI bridge: keep the class and its native methods with their exact names.
-keep class com.drsai.assistant.llm.LlamaNative { *; }
-keepclasseswithmembernames class * { native <methods>; }

# ONNX Runtime: the native library looks up Java classes and members by name over JNI.
-keep class ai.onnxruntime.** { *; }
-dontwarn ai.onnxruntime.**
