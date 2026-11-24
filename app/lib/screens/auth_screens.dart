import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/config.dart';
import '../core/session.dart';
import '../widgets/common.dart';

Future<void> showServerDialog(BuildContext context) async {
  final c = TextEditingController(text: Config.serverUrl);
  await showDialog(
    context: context,
    builder: (ctx) => AlertDialog(
      title: const Text('Server address'),
      content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Address of your Minutes backend (without /api).'),
        const SizedBox(height: 12),
        TextField(
          controller: c,
          keyboardType: TextInputType.url,
          autocorrect: false,
          decoration: const InputDecoration(hintText: 'https://meet.example.com'),
        ),
        const SizedBox(height: 8),
        Text('Android emulator → http://10.0.2.2:5000\niOS simulator → http://localhost:5000\nPhone → your computer\'s LAN IP or a public URL',
            style: Theme.of(ctx).textTheme.bodySmall),
      ]),
      actions: [
        TextButton(onPressed: () { c.text = Config.defaultServerUrl; }, child: const Text('Reset')),
        TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
        FilledButton(
          onPressed: () async {
            await Config.setServerUrl(c.text);
            if (ctx.mounted) Navigator.pop(ctx);
          },
          child: const Text('Save'),
        ),
      ],
    ),
  );
}

class _AuthScaffold extends StatelessWidget {
  final String title;
  final String subtitle;
  final List<Widget> children;
  const _AuthScaffold({required this.title, required this.subtitle, required this.children});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Align(
                  alignment: Alignment.centerLeft,
                  child: Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(color: cs.primary, borderRadius: BorderRadius.circular(14)),
                    child: Icon(Icons.videocam_rounded, color: cs.onPrimary, size: 28),
                  ),
                ),
                const SizedBox(height: 20),
                Text(title, style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w600)),
                const SizedBox(height: 4),
                Text(subtitle, style: TextStyle(color: cs.outline)),
                const SizedBox(height: 24),
                ...children,
                const SizedBox(height: 12),
                Center(
                  child: TextButton.icon(
                    onPressed: () => showServerDialog(context).then((_) => (context as Element).markNeedsBuild()),
                    icon: const Icon(Icons.dns_outlined, size: 18),
                    label: Text(Config.serverUrl, overflow: TextOverflow.ellipsis),
                  ),
                ),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _pass = TextEditingController();
  bool _busy = false;
  bool _hide = true;
  bool _needsVerify = false;

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() { _busy = true; _needsVerify = false; });
    try {
      await Session.instance.login(_email.text, _pass.text);
    } on ApiException catch (e) {
      if (!mounted) return;
      if (e.code == 'EMAIL_NOT_VERIFIED') _needsVerify = true;
      toast(context, e.message, error: true);
    } catch (e) {
      if (mounted) toast(context, errMsg(e), error: true);
    }
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _resend() async {
    await guard(context, () => Api.instance.post('/auth/resend-verification', {'email': _email.text.trim()}),
        success: 'Verification email sent');
  }

  @override
  Widget build(BuildContext context) {
    return _AuthScaffold(
      title: 'Welcome back',
      subtitle: 'Sign in to meet, chat and get things done.',
      children: [
        Form(
          key: _form,
          child: Column(children: [
            TextFormField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              autofillHints: const [AutofillHints.email],
              decoration: const InputDecoration(labelText: 'Email', prefixIcon: Icon(Icons.mail_outline)),
              validator: (v) => (v == null || !v.contains('@')) ? 'Enter a valid email' : null,
            ),
            const SizedBox(height: 14),
            TextFormField(
              controller: _pass,
              obscureText: _hide,
              autofillHints: const [AutofillHints.password],
              decoration: InputDecoration(
                labelText: 'Password',
                prefixIcon: const Icon(Icons.lock_outline),
                suffixIcon: IconButton(icon: Icon(_hide ? Icons.visibility : Icons.visibility_off), onPressed: () => setState(() => _hide = !_hide)),
              ),
              validator: (v) => (v == null || v.isEmpty) ? 'Enter your password' : null,
              onFieldSubmitted: (_) => _submit(),
            ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: _busy ? null : _submit,
              child: _busy ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Sign in'),
            ),
            if (_needsVerify) TextButton(onPressed: _resend, child: const Text('Resend verification email')),
          ]),
        ),
        const SizedBox(height: 8),
        TextButton(
          onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SignupScreen())),
          child: const Text("Don't have an account? Sign up"),
        ),
      ],
    );
  }
}

class SignupScreen extends StatefulWidget {
  const SignupScreen({super.key});
  @override
  State<SignupScreen> createState() => _SignupScreenState();
}

class _SignupScreenState extends State<SignupScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _pass = TextEditingController();
  bool _busy = false;

  Future<void> _submit() async {
    if (!_form.currentState!.validate()) return;
    setState(() => _busy = true);
    try {
      final msg = await Session.instance.signup(_name.text, _email.text, _pass.text);
      if (!mounted) return;
      if (msg != null) {
        toast(context, msg);
        Navigator.pop(context);
      } else {
        Navigator.popUntil(context, (r) => r.isFirst);
      }
    } catch (e) {
      if (mounted) toast(context, errMsg(e), error: true);
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    return Stack(children: [
      _AuthScaffold(
        title: 'Create your account',
        subtitle: 'Free to start. No credit card needed.',
        children: [
          Form(
            key: _form,
            child: Column(children: [
              TextFormField(
                controller: _name,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(labelText: 'Full name', prefixIcon: Icon(Icons.person_outline)),
                validator: (v) => (v == null || v.trim().length < 2) ? 'Enter your name' : null,
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(labelText: 'Email', prefixIcon: Icon(Icons.mail_outline)),
                validator: (v) => (v == null || !v.contains('@')) ? 'Enter a valid email' : null,
              ),
              const SizedBox(height: 14),
              TextFormField(
                controller: _pass,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Password (min 6 characters)', prefixIcon: Icon(Icons.lock_outline)),
                validator: (v) => (v == null || v.length < 6) ? 'At least 6 characters' : null,
              ),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: _busy ? null : _submit,
                child: _busy ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Create account'),
              ),
            ]),
          ),
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Already have an account? Sign in')),
        ],
      ),
      Positioned(top: 0, left: 0, child: SafeArea(child: BackButton(onPressed: () => Navigator.pop(context)))),
    ]);
  }
}
