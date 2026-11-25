import 'package:flutter/material.dart';
import '../core/api.dart';
import '../core/session.dart';
import '../core/theme.dart';
import '../widgets/common.dart';

/// Centered card on the dark background, as on the web sign-in and sign-up pages.
class _AuthScaffold extends StatelessWidget {
  final String title;
  final String subtitle;
  final List<Widget> children;
  const _AuthScaffold({required this.title, required this.subtitle, required this.children});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(color: AppTheme.surface, border: Border.all(color: AppTheme.line), borderRadius: BorderRadius.circular(14)),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  const Center(child: BrandMark(size: 72)),
                  const SizedBox(height: 16),
                  Text(title, textAlign: TextAlign.center, style: const TextStyle(fontFamily: AppTheme.display, fontSize: 24, fontWeight: FontWeight.w500)),
                  const SizedBox(height: 4),
                  Text(subtitle, textAlign: TextAlign.center, style: const TextStyle(color: AppTheme.muted, fontSize: 14)),
                  const SizedBox(height: 28),
                  ...children,
                ]),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// A web-style field: label above the input.
class _Labeled extends StatelessWidget {
  final String label;
  final Widget child;
  const _Labeled(this.label, this.child);
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
          const SizedBox(height: 8),
          child,
        ]),
      );
}

class _SubmitButton extends StatelessWidget {
  final String label;
  final bool busy;
  final VoidCallback onPressed;
  const _SubmitButton({required this.label, required this.busy, required this.onPressed});
  @override
  Widget build(BuildContext context) => SizedBox(
        width: double.infinity,
        child: FilledButton(
          style: FilledButton.styleFrom(minimumSize: const Size(0, 52)),
          onPressed: busy ? null : onPressed,
          child: busy
              ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2))
              : Row(mainAxisSize: MainAxisSize.min, children: [Text(label), const SizedBox(width: 8), const Icon(Icons.arrow_forward, size: 18)]),
        ),
      );
}

Widget _switchLine(String question, String action, VoidCallback onTap) => Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Wrap(alignment: WrapAlignment.center, crossAxisAlignment: WrapCrossAlignment.center, children: [
        Text(question, style: const TextStyle(color: AppTheme.muted, fontSize: 14)),
        TextButton(onPressed: onTap, child: Text(action, style: const TextStyle(fontWeight: FontWeight.w500))),
      ]),
    );

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
      title: 'Sign in',
      subtitle: 'Join meetings, chat with your team and revisit recordings',
      children: [
        Form(
          key: _form,
          child: Column(children: [
            _Labeled('Email', TextFormField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              autofillHints: const [AutofillHints.email],
              decoration: const InputDecoration(hintText: 'you@example.com', prefixIcon: Icon(Icons.mail_outline, size: 20)),
              validator: (v) => (v == null || !v.contains('@')) ? 'Enter a valid email' : null,
            )),
            _Labeled('Password', TextFormField(
              controller: _pass,
              obscureText: _hide,
              autofillHints: const [AutofillHints.password],
              decoration: InputDecoration(
                hintText: 'Enter your password',
                prefixIcon: const Icon(Icons.lock_outline, size: 20),
                suffixIcon: IconButton(icon: Icon(_hide ? Icons.visibility_outlined : Icons.visibility_off_outlined, size: 20), onPressed: () => setState(() => _hide = !_hide)),
              ),
              validator: (v) => (v == null || v.isEmpty) ? 'Enter your password' : null,
              onFieldSubmitted: (_) => _submit(),
            )),
            const SizedBox(height: 4),
            _SubmitButton(label: 'Sign in', busy: _busy, onPressed: _submit),
            if (_needsVerify) TextButton(onPressed: _resend, child: const Text('Resend verification email')),
          ]),
        ),
        _switchLine("Don't have an account?", 'Sign up', () => Navigator.push(context, MaterialPageRoute(builder: (_) => const SignupScreen()))),
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
  final _confirm = TextEditingController();
  bool _busy = false;
  bool _hide = true;

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
        subtitle: 'Every new account starts on the Free plan',
        children: [
          Form(
            key: _form,
            child: Column(children: [
              _Labeled('Full name', TextFormField(
                controller: _name,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(hintText: 'John Doe', prefixIcon: Icon(Icons.person_outline, size: 20)),
                validator: (v) => (v == null || v.trim().length < 2) ? 'Enter your name' : null,
              )),
              _Labeled('Email', TextFormField(
                controller: _email,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(hintText: 'you@example.com', prefixIcon: Icon(Icons.mail_outline, size: 20)),
                validator: (v) => (v == null || !v.contains('@')) ? 'Enter a valid email' : null,
              )),
              _Labeled('Password', TextFormField(
                controller: _pass,
                obscureText: _hide,
                decoration: InputDecoration(
                  hintText: 'Min 6 characters',
                  prefixIcon: const Icon(Icons.lock_outline, size: 20),
                  suffixIcon: IconButton(icon: Icon(_hide ? Icons.visibility_outlined : Icons.visibility_off_outlined, size: 20), onPressed: () => setState(() => _hide = !_hide)),
                ),
                validator: (v) => (v == null || v.length < 6) ? 'At least 6 characters' : null,
              )),
              _Labeled('Confirm password', TextFormField(
                controller: _confirm,
                obscureText: _hide,
                decoration: const InputDecoration(hintText: 'Repeat password', prefixIcon: Icon(Icons.lock_outline, size: 20)),
                validator: (v) => v != _pass.text ? 'Passwords do not match' : null,
              )),
              const SizedBox(height: 4),
              _SubmitButton(label: 'Create account', busy: _busy, onPressed: _submit),
            ]),
          ),
          _switchLine('Already have an account?', 'Sign in', () => Navigator.pop(context)),
        ],
      ),
      Positioned(top: 0, left: 0, child: SafeArea(child: BackButton(onPressed: () => Navigator.pop(context)))),
    ]);
  }
}
