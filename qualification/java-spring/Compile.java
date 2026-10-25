import javax.tools.ToolProvider;
/** Use the installed JDK compiler module when the javac command is not on PATH. */
class Compile {
    public static void main(String[] args) {
        var compiler = ToolProvider.getSystemJavaCompiler();
        if (compiler == null) throw new IllegalStateException("JDK compiler module is required");
        int code = compiler.run(null, System.out, System.err, args);
        if (code != 0) throw new IllegalStateException("Compilation failed: " + code);
    }
}
