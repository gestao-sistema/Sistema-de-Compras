-- ============================================================
-- SISTEMA DE COMPRAS — Schema Supabase (versão final)
-- Execute no SQL Editor do seu projeto Supabase
-- ============================================================

-- ── 1. TABELA DE PERFIS ──────────────────────────────────────
CREATE TABLE public.profiles (
  id         UUID        REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  nome       TEXT        NOT NULL,
  empresa    TEXT        NOT NULL DEFAULT 'ambas'   CHECK (empresa IN ('alinare','novitah','ambas')),
  role       TEXT        NOT NULL DEFAULT 'usuario' CHECK (role    IN ('admin','usuario')),
  ativo      BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Usuário lê o próprio perfil; admin lê todos
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (
    auth.uid() = id
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Somente admin pode inserir/atualizar/deletar perfis
CREATE POLICY "profiles_insert" ON public.profiles
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "profiles_delete" ON public.profiles
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ── 2. TABELA DE PERMISSÕES ──────────────────────────────────
CREATE TABLE public.permissoes (
  id       UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id  UUID    REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  chave    TEXT    NOT NULL,
  liberado BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(user_id, chave)
);

ALTER TABLE public.permissoes ENABLE ROW LEVEL SECURITY;

-- Usuário lê as próprias permissões
CREATE POLICY "permissoes_select" ON public.permissoes
  FOR SELECT USING (user_id = auth.uid());

-- Somente admin gerencia permissões
CREATE POLICY "permissoes_all" ON public.permissoes
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- ── 3. TRIGGER — cria perfil ao registrar usuário ────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, empresa, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome',    NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'empresa', 'ambas'),
    COALESCE(NEW.raw_user_meta_data->>'role',    'usuario')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 4. APÓS RODAR O SCHEMA: ──────────────────────────────────
-- a) Vá em Authentication > Users > Add user
--    Crie seu usuário com e-mail e senha
--
-- b) Copie o UUID gerado e execute:
--
--    UPDATE public.profiles
--    SET role = 'admin', empresa = 'ambas'
--    WHERE id = 'COLE-SEU-UUID-AQUI';
--
-- Pronto — faça login no sistema e acesse /admin para criar os demais usuários.
-- ─────────────────────────────────────────────────────────────
