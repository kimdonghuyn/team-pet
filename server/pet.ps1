# Desktop pet window (server/pet.js fills __PORT__ __PARENT__ __PETS__ __ICON__).
# My pet sits at the right end; the people on my floors sit beside it, each as the
# animal they picked, and whoever speaks gets the bubble over their own pet.
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName PresentationFramework, PresentationCore, WindowsBase, System.Windows.Forms, System.Drawing
# 127.0.0.1, not localhost: the server listens on IPv4 only, and .NET tries ::1 first for localhost —
# about 0.7 s lost on every call, with the pet frozen meanwhile (the gauge, the menus, everything).
$base = 'http://127.0.0.1:__PORT__'; $parent = __PARENT__; $pets = '__PETS__'
# One colour per floor, for its group's bar and its name in the chat.
$COLORS = '#A496FF', '#4FD1A1', '#FFB454', '#FF8A8A', '#5CC8FF'
function Call($path, $body) {
  $c = New-Object System.Net.WebClient; $c.Encoding = [Text.Encoding]::UTF8
  try {
    if ($null -eq $body) { return ($c.DownloadString("$base$path") | ConvertFrom-Json) }
    $c.Headers['Content-Type'] = 'application/json; charset=utf-8'
    [void]$c.UploadString("$base$path", 'POST', ($body | ConvertTo-Json -Compress)); return $true
  } catch { return $null }
}
# A POST whose answer matters (a game's state): the parsed answer, or @{ error } on a refusal.
function Ask($path, $body) {
  $c = New-Object System.Net.WebClient; $c.Encoding = [Text.Encoding]::UTF8
  $c.Headers['Content-Type'] = 'application/json; charset=utf-8'
  # Deep enough for a drawn line: { stroke: { points: [[x, y], ...] } }.
  try { return ($c.UploadString("$base$path", 'POST', ($body | ConvertTo-Json -Compress -Depth 6)) | ConvertFrom-Json) }
  catch {
    $msg = '연결되지 않았어요'
    try { $r = New-Object IO.StreamReader($_.Exception.InnerException.Response.GetResponseStream(), [Text.Encoding]::UTF8); $msg = ($r.ReadToEnd() | ConvertFrom-Json).error } catch {}
    return @{ error = $msg }
  }
}
[xml]$x = @'
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
 WindowStyle="None" AllowsTransparency="True" Background="Transparent" Topmost="True" ShowInTaskbar="False" SizeToContent="WidthAndHeight" ResizeMode="NoResize">
 <!-- The game panels' buttons: rounded, no system chrome (its light blue hover clashes with
      the dark panels); a little lighter under the mouse, dimmer pressed or off. -->
 <Window.Resources>
  <Style TargetType="Button">
   <Setter Property="Template"><Setter.Value>
    <ControlTemplate TargetType="Button">
     <Border x:Name="Face" Background="{TemplateBinding Background}" CornerRadius="9" Padding="{TemplateBinding Padding}" SnapsToDevicePixels="True">
      <ContentPresenter HorizontalAlignment="Center" VerticalAlignment="Center"/></Border>
     <ControlTemplate.Triggers>
      <Trigger Property="IsMouseOver" Value="True"><Setter TargetName="Face" Property="Opacity" Value="0.85"/></Trigger>
      <Trigger Property="IsPressed" Value="True"><Setter TargetName="Face" Property="Opacity" Value="0.7"/></Trigger>
      <Trigger Property="IsEnabled" Value="False"><Setter TargetName="Face" Property="Opacity" Value="0.4"/></Trigger>
     </ControlTemplate.Triggers>
    </ControlTemplate>
   </Setter.Value></Setter>
  </Style>
 </Window.Resources>
 <StackPanel>
  <!-- 🏁 낚시대회: who is in while it takes joiners, then the live board and the time left (see Show-Contest). -->
  <Border x:Name="Contest" Visibility="Collapsed" Background="#F21E1B2E" CornerRadius="10" Padding="10,8,10,8" Width="250" Margin="0,0,4,3" HorizontalAlignment="Right" BorderBrush="#3B9EDB" BorderThickness="2">
   <StackPanel>
    <Grid><TextBlock x:Name="ContestTitle" FontFamily="Malgun Gothic" FontSize="12" Foreground="#9FD8FF" FontWeight="Bold"/>
     <TextBlock x:Name="ContestClock" FontFamily="Segoe UI Symbol, Malgun Gothic" FontSize="12" Foreground="#FFD27A" FontWeight="Bold" HorizontalAlignment="Right"/></Grid>
    <StackPanel x:Name="ContestBoard" Margin="0,6,0,0"/>
    <TextBlock x:Name="ContestText" FontFamily="Malgun Gothic" FontSize="11" Foreground="#CFC9E6" TextWrapping="Wrap" Margin="0,4,0,0"/>
    <WrapPanel x:Name="ContestButtons" HorizontalAlignment="Center" Margin="0,4,0,0"/>
   </StackPanel></Border>
  <!-- 👋 시작하기 · 🔑 다른 방 · 🏠 첫 방 · 📋 참가 코드: the first run and the rooms, in the pet (see Start-Open). -->
  <Border x:Name="Start" Visibility="Collapsed" Background="#F21E1B2E" CornerRadius="10" Padding="12" Width="250" Margin="0,0,4,3" HorizontalAlignment="Right" BorderBrush="#F5C542" BorderThickness="2">
   <StackPanel>
    <TextBlock x:Name="StartTitle" FontFamily="Malgun Gothic" FontSize="14" Foreground="#FFE08A" FontWeight="Bold"/>
    <StackPanel x:Name="StartBody"/>
   </StackPanel></Border>
  <!-- 🎲 같이 하기: 🏗 높이 쌓기 · 💣 폭탄 돌리기 · 🔤 끝말잇기 (see Show-Party). -->
  <Border x:Name="Party" Visibility="Collapsed" Background="#F21E1B2E" CornerRadius="10" Padding="10" Width="250" Margin="0,0,4,3" HorizontalAlignment="Right" BorderBrush="#7C6CF0" BorderThickness="2">
   <StackPanel>
    <Grid><TextBlock x:Name="PartyTitle" FontFamily="Malgun Gothic" FontSize="11" Foreground="#CFC7FF" FontWeight="Bold" TextWrapping="Wrap" Margin="0,0,26,0"/>
     <ContentControl x:Name="PartyStop" HorizontalAlignment="Right" VerticalAlignment="Top" Margin="0,-4,-4,0"/></Grid>
    <Border x:Name="PartyTower" Visibility="Collapsed" Width="220" Height="240" Margin="0,6,0,0" Background="#141221" CornerRadius="6" ClipToBounds="True" Cursor="Hand">
     <Canvas x:Name="PartyStack"/></Border>
    <TextBlock x:Name="PartyStage" FontFamily="Malgun Gothic" FontSize="13" Foreground="White" TextWrapping="Wrap" TextAlignment="Center" Margin="0,6,0,0" RenderTransformOrigin="0.5,0.5"/>
    <TextBlock x:Name="PartyText" FontFamily="Malgun Gothic" FontSize="13" Foreground="White" TextWrapping="Wrap" TextAlignment="Center" Margin="0,6,0,0"/>
    <TextBox x:Name="PartyWord" Visibility="Collapsed" FontFamily="Malgun Gothic" FontSize="13" Padding="5,3" Margin="0,6,0,0" Background="#2A2640" Foreground="White" BorderBrush="#7C6CF0" CaretBrush="White"/>
    <WrapPanel x:Name="PartyButtons" HorizontalAlignment="Center" Margin="0,8,0,0"/>
   </StackPanel></Border>
  <!-- 🎨 이어 그리기: the table, my turn to draw or to name it, and the ending (see Show-Relay). -->
  <Border x:Name="Relay" Visibility="Collapsed" Background="#F21E1B2E" CornerRadius="10" Padding="10" Width="250" Margin="0,0,4,3" HorizontalAlignment="Right" BorderBrush="#2A9D8F" BorderThickness="2">
   <StackPanel>
    <Grid><TextBlock x:Name="RelayTitle" FontFamily="Malgun Gothic" FontSize="11" Foreground="#7EE0C8" FontWeight="Bold" TextWrapping="Wrap" Margin="0,0,26,0"/>
     <ContentControl x:Name="RelayStop" HorizontalAlignment="Right" VerticalAlignment="Top" Margin="0,-4,-4,0"/></Grid>
    <TextBlock x:Name="RelayText" FontFamily="Malgun Gothic" FontSize="13" Foreground="White" TextWrapping="Wrap" TextAlignment="Center" Margin="0,6,0,0"/>
    <Border x:Name="RelaySheet" Visibility="Collapsed" Width="220" Height="220" Margin="0,6,0,0" Background="White" CornerRadius="6" ClipToBounds="True">
     <Grid><Canvas x:Name="RelayPast" IsHitTestVisible="False"/><InkCanvas x:Name="RelayInk" Background="Transparent"/></Grid></Border>
    <TextBox x:Name="RelayGuess" Visibility="Collapsed" FontFamily="Malgun Gothic" FontSize="13" Padding="5,3" Margin="0,6,0,0" Background="#2A2640" Foreground="White" BorderBrush="#2A9D8F" CaretBrush="White"/>
    <WrapPanel x:Name="RelayButtons" HorizontalAlignment="Center" Margin="0,8,0,0"/>
   </StackPanel></Border>
  <!-- 📖 물고기 도감: every kind as a card (shadows until caught), the picked one big, the floor's top three (see Book-Draw). -->
  <Border x:Name="Book" Visibility="Collapsed" Background="#F21E1B2E" CornerRadius="10" Padding="10" Width="250" Margin="0,0,4,3" HorizontalAlignment="Right" BorderBrush="#5DADEC" BorderThickness="2">
   <StackPanel>
    <TextBlock x:Name="BookTitle" FontFamily="Malgun Gothic" FontSize="11" Foreground="#9CD3FF" FontWeight="Bold"/>
    <TextBlock x:Name="BookSum" FontFamily="Malgun Gothic" FontSize="12" Foreground="White" Margin="0,4,0,0"/>
    <WrapPanel x:Name="BookTabs" Margin="0,6,0,0"/>
    <StackPanel x:Name="BookDetail" Orientation="Horizontal" Visibility="Collapsed" Margin="0,6,0,0"/>
    <ScrollViewer Height="114" VerticalScrollBarVisibility="Hidden" Margin="0,6,0,0" ToolTip="휠로 넘겨 보세요"><WrapPanel x:Name="BookGrid"/></ScrollViewer>
    <TextBlock x:Name="BookTop" FontFamily="Malgun Gothic" FontSize="11" Foreground="#E8E4FF" TextWrapping="Wrap" Margin="0,6,0,0"/>
    <WrapPanel x:Name="BookButtons" HorizontalAlignment="Center" Margin="0,4,0,0"/>
   </StackPanel></Border>
  <!-- ⚒️ 낚싯대 강화: this rod and the next, points, 장인의 기운, charms, the odds (see Forge-Open). -->
  <Border x:Name="Forge" Visibility="Collapsed" Background="#F21E1B2E" CornerRadius="10" Padding="10" Width="250" Margin="0,0,4,3" HorizontalAlignment="Right" BorderBrush="#E0A83A" BorderThickness="2">
   <StackPanel>
    <TextBlock x:Name="ForgeTitle" FontFamily="Malgun Gothic" FontSize="11" Foreground="#FFD27A" FontWeight="Bold"/>
    <Grid x:Name="ForgeStage" Height="62" Margin="0,2,0,0"/>
    <TextBlock x:Name="ForgeSum" FontFamily="Malgun Gothic" FontSize="12" Foreground="White" TextWrapping="Wrap" Margin="0,2,0,0"/>
    <Grid Height="12" Margin="0,6,0,0"><Border Background="#2E2A45" CornerRadius="6"/><Border x:Name="ForgeGauge" Background="#E0A83A" CornerRadius="6" HorizontalAlignment="Left" Width="0"/>
     <TextBlock x:Name="ForgeGaugeText" FontFamily="Malgun Gothic" FontSize="9" Foreground="White" FontWeight="Bold" HorizontalAlignment="Center" VerticalAlignment="Center"/></Grid>
    <TextBlock x:Name="ForgeText" FontFamily="Malgun Gothic" FontSize="11" Foreground="#E8E4FF" TextWrapping="Wrap" Margin="0,6,0,0"/>
    <WrapPanel x:Name="ForgeButtons" HorizontalAlignment="Center" Margin="0,4,0,0"/>
   </StackPanel></Border>
  <!-- 🏆 기록 도전: the pick of game, the pad or the 5×5 grid, and the floor's top three (see Record-Idle). -->
  <Border x:Name="Record" Visibility="Collapsed" Background="#F21E1B2E" CornerRadius="10" Padding="10" Width="250" Margin="0,0,4,3" HorizontalAlignment="Right" BorderBrush="#E9B949" BorderThickness="2">
   <StackPanel>
    <TextBlock x:Name="RecordTitle" FontFamily="Malgun Gothic" FontSize="11" Foreground="#FFD166" FontWeight="Bold" TextWrapping="Wrap"/>
    <WrapPanel x:Name="RecordPick" HorizontalAlignment="Center" Margin="0,6,0,0"/>
    <Border x:Name="RecordPad" Visibility="Collapsed" Height="110" Margin="0,6,0,0" CornerRadius="8" Cursor="Hand">
     <TextBlock x:Name="RecordPadText" FontFamily="Malgun Gothic" FontSize="16" FontWeight="Bold" Foreground="White" HorizontalAlignment="Center" VerticalAlignment="Center"/></Border>
    <UniformGrid x:Name="RecordGrid" Visibility="Collapsed" Rows="5" Columns="5" Width="220" Height="220" Margin="0,6,0,0"/>
    <TextBlock x:Name="RecordText" FontFamily="Malgun Gothic" FontSize="13" Foreground="White" TextWrapping="Wrap" TextAlignment="Center" Margin="0,6,0,0"/>
    <TextBlock x:Name="RecordTop" FontFamily="Malgun Gothic" FontSize="12" Foreground="#E8E4FF" TextWrapping="Wrap" Margin="0,6,0,0" Padding="2"/>
    <WrapPanel x:Name="RecordButtons" HorizontalAlignment="Center" Margin="0,8,0,0"/>
   </StackPanel></Border>
  <!-- ⚔️ 대결: an invite to answer, or the game itself (see Show-Duel). -->
  <Border x:Name="Duel" Visibility="Collapsed" Background="#F21E1B2E" CornerRadius="10" Padding="10" Width="250" Margin="0,0,4,3" HorizontalAlignment="Right" BorderBrush="#F59E0B" BorderThickness="2">
   <StackPanel>
    <TextBlock x:Name="DuelTitle" FontFamily="Malgun Gothic" FontSize="11" Foreground="#FCD34D" FontWeight="Bold"/>
    <StackPanel x:Name="DuelStage" Orientation="Horizontal" HorizontalAlignment="Center" Margin="0,6,0,0"/>
    <TextBlock x:Name="DuelText" FontFamily="Malgun Gothic" FontSize="14" Foreground="White" TextWrapping="Wrap" TextAlignment="Center" Margin="0,6,0,0"/>
    <WrapPanel x:Name="DuelButtons" HorizontalAlignment="Center" Margin="0,8,0,0"/>
   </StackPanel></Border>
  <!-- The chat keeps its own size and see-through level (see Chat-Size): drag the corner chip at
       its top left (up-left bigger, the window stays pinned at the bottom right); the lines scroll. -->
  <StackPanel x:Name="Chat" Visibility="Collapsed" Margin="0,0,4,3" HorizontalAlignment="Right">
  <Border x:Name="ChatBox" Background="#F21E1B2E" CornerRadius="10" Padding="8" Width="250">
   <Grid x:Name="ChatBody"><StackPanel>
    <ScrollViewer x:Name="LinesBox" Height="160" VerticalScrollBarVisibility="Hidden" HorizontalScrollBarVisibility="Disabled" Margin="0,0,0,6">
     <StackPanel x:Name="Lines"/></ScrollViewer>
    <TextBlock x:Name="Target" Visibility="Collapsed" FontFamily="Malgun Gothic" FontSize="11" Foreground="#CFC7FF" Margin="0,0,0,4" TextWrapping="Wrap"/>
    <Grid x:Name="Pend" Visibility="Collapsed" HorizontalAlignment="Left" Margin="0,0,0,4">
     <Border CornerRadius="6" BorderBrush="#7C6CF0" BorderThickness="1" Padding="2"><Image x:Name="PendImg" MaxHeight="72" MaxWidth="200" Stretch="Uniform"/></Border>
     <Border x:Name="PendX" Background="#E61E1B2E" CornerRadius="8" Width="16" Height="16" HorizontalAlignment="Right" VerticalAlignment="Top" Margin="0,-5,-5,0" Cursor="Hand" ToolTip="빼기 (Esc)">
      <TextBlock Text="✕" FontSize="10" Foreground="White" HorizontalAlignment="Center" VerticalAlignment="Center"/></Border>
    </Grid>
    <!-- Shade repeats the line over the box with only "@이름" drawn (mint, on the box's own
         colour so the white letters under it are hidden): the rest stays the box's own text,
         so Korean being composed always shows. -->
    <Grid>
     <TextBox x:Name="Input" FontFamily="Malgun Gothic" FontSize="12" Padding="5,3" Background="#2A2640" Foreground="White" BorderBrush="#7C6CF0" CaretBrush="White"/>
     <TextBlock x:Name="Hint" IsHitTestVisible="False" FontFamily="Malgun Gothic" FontSize="11" Margin="8,4,6,4" VerticalAlignment="Center" Foreground="#8F86B8"/>
     <TextBlock x:Name="Shade" IsHitTestVisible="False" FontFamily="Malgun Gothic" FontSize="12" Margin="8,4,6,4" VerticalAlignment="Top" Visibility="Collapsed"/>
    </Grid>
   </StackPanel>
   <Border x:Name="ChatGrip" Opacity="0.35" HorizontalAlignment="Left" VerticalAlignment="Top" Margin="-6,-6,0,0" Width="18" Height="18" CornerRadius="9"
    Background="#E61E1B2E" BorderBrush="#4A4470" BorderThickness="1" Cursor="SizeNWSE" ToolTip="끌어서 대화창 크기 조절 (진하기는 오른쪽 위 ◐)">
    <TextBlock Text="⤡" FontSize="11" Foreground="#CFC9E6" HorizontalAlignment="Center" VerticalAlignment="Center"/></Border>
   <!-- Its pair at the top right: ◐ alone, and under the mouse the chat's see-through bar
        unfolds beside it (see Fold-ChatAlpha). -->
   <Border x:Name="ChatAlphaRow" HorizontalAlignment="Right" VerticalAlignment="Top" Margin="0,-6,-6,0" CornerRadius="9" Opacity="0.35" ToolTip="대화창 진하기">
    <StackPanel x:Name="ChatAlphaIn" Orientation="Horizontal"/></Border>
   </Grid></Border>
  <!-- Where Enter goes, as folder tabs hanging from the box's bottom edge (see Render-Tabs):
       the floor's talk, and a note to one person. The open one wears the box's own colour. -->
  <WrapPanel x:Name="Tabs" Margin="12,0,0,0"/>
  </StackPanel>
  <!-- 🆕 A newer release is ready (server/release-update.js, see Show-Update): put it in now, or later. -->
  <Border x:Name="Upd" Visibility="Collapsed" Background="#F21E1B2E" CornerRadius="10" Padding="10,7,10,8" Width="250" Margin="0,0,4,3" HorizontalAlignment="Right" BorderBrush="#3FAE6B" BorderThickness="1">
   <StackPanel>
    <TextBlock x:Name="UpdText" FontFamily="Malgun Gothic" FontSize="12" Foreground="#E6F4EA" TextWrapping="Wrap" LineHeight="18"/>
    <WrapPanel x:Name="UpdButtons" HorizontalAlignment="Right" Margin="0,4,0,0"/>
   </StackPanel></Border>
  <!-- 📦 What the update just installed changed (see Show-News): small and dark, put away once read. -->
  <Border x:Name="News" Visibility="Collapsed" Background="#F21E1B2E" CornerRadius="10" Padding="10,7,10,8" Width="250" Margin="0,0,4,3" HorizontalAlignment="Right" BorderBrush="#2E2A42" BorderThickness="1" Cursor="Hand">
   <StackPanel>
    <Grid><TextBlock x:Name="NewsTitle" FontFamily="Malgun Gothic" FontSize="11" Foreground="#9A93BD" FontWeight="Bold" Margin="0,0,20,0"/>
     <TextBlock x:Name="NewsX" Text="✕" FontSize="11" Foreground="#7D769E" HorizontalAlignment="Right" VerticalAlignment="Top" Padding="6,0,0,4" Background="#01000000" ToolTip="닫기 (다시 안 뜹니다)"/></Grid>
    <TextBlock x:Name="NewsText" FontFamily="Malgun Gothic" FontSize="12" Foreground="#CFC9E6" TextWrapping="Wrap" Margin="0,4,0,0" LineHeight="18"/>
    <StackPanel x:Name="NewsList" Visibility="Collapsed" Margin="0,2,0,0"/>
   </StackPanel></Border>
  <!-- Room on the left for the first friend's bubble to hang out; empty pixels are click-through.
       The grip sits right against the first pet, at the pets' height: with a gap of clear pixels
       between them the mouse would leave the window on its way and the grip would hide. It only
       fades almost out (Opacity 0.02: fully clear pixels let clicks through this window), never
       leaves, so hovering its spot shows it too. Drag it to resize. -->
  <Grid HorizontalAlignment="Right">
   <StackPanel x:Name="Row" Orientation="Horizontal" HorizontalAlignment="Right" Margin="70,0,0,0"/>
   <Border x:Name="Grip" Opacity="0.02" HorizontalAlignment="Left" VerticalAlignment="Bottom" Margin="48,0,0,20" Width="22" Height="22" CornerRadius="11"
    Background="#E61E1B2E" BorderBrush="#7C6CF0" BorderThickness="1" Cursor="SizeNWSE" ToolTip="끌어서 크기 조절 (펫 위에서 Ctrl+휠도 됩니다)">
    <TextBlock Text="⤡" FontSize="13" Foreground="White" HorizontalAlignment="Center" VerticalAlignment="Center"/></Border>
  </Grid>
 </StackPanel>
</Window>
'@
$w = [Windows.Markup.XamlReader]::Load((New-Object System.Xml.XmlNodeReader $x))
$ui = @{}; foreach ($n in 'Upd', 'UpdText', 'UpdButtons', 'Start', 'StartTitle', 'StartBody', 'Forge', 'ForgeTitle', 'ForgeStage', 'ForgeSum', 'ForgeGauge', 'ForgeGaugeText', 'ForgeText', 'ForgeButtons', 'Book', 'BookTitle', 'BookSum', 'BookTabs', 'BookDetail', 'BookGrid', 'BookTop', 'BookButtons', 'Record', 'RecordTitle', 'RecordPick', 'RecordPad', 'RecordPadText', 'RecordGrid', 'RecordText', 'RecordTop', 'RecordButtons', 'PartyStop', 'RelayStop', 'Party', 'PartyTitle', 'PartyTower', 'PartyStack', 'PartyStage', 'PartyText', 'PartyWord', 'PartyButtons', 'Relay', 'RelayTitle', 'RelayText', 'RelaySheet', 'RelayPast', 'RelayInk', 'RelayGuess', 'RelayButtons', 'Duel', 'DuelTitle', 'DuelStage', 'DuelText', 'DuelButtons', 'Chat', 'ChatBox', 'ChatAlphaRow', 'ChatAlphaIn', 'ChatBody', 'ChatGrip', 'LinesBox', 'Lines', 'Tabs', 'Hint', 'Target', 'Pend', 'PendImg', 'PendX', 'Input', 'Shade', 'Row', 'Grip', 'News', 'NewsTitle', 'NewsX', 'NewsText', 'NewsList', 'Contest', 'ContestTitle', 'ContestClock', 'ContestBoard', 'ContestText', 'ContestButtons') { $ui[$n] = $w.FindName($n) }
$S = @{ seen = @{}; first = $true; pokes = -1; floor = $null; shakeUntil = [datetime]::MinValue; tick = 0; state = $null; down = $null; cast = ''; kinds = @{}; members = [ordered]@{} }
$conv = New-Object Windows.Media.BrushConverter

function Frames($kind) {
  if (-not $S.kinds.ContainsKey($kind)) {
    $bmp = New-Object Windows.Media.Imaging.BitmapImage
    $bmp.BeginInit(); $bmp.UriSource = [Uri]"$pets\$kind.png"; $bmp.CacheOption = 'OnLoad'; $bmp.EndInit()
    $S.kinds[$kind] = @(0..3 | ForEach-Object { New-Object Windows.Media.Imaging.CroppedBitmap $bmp, (New-Object Windows.Int32Rect ($_ * 16), 0, 16, 16) })
  }
  return $S.kinds[$kind]
}
function Badge($color, $size) { $b = New-Object Windows.Controls.Border; $b.Width = $size; $b.Height = $size; $b.CornerRadius = $size / 2
  $b.Background = $conv.ConvertFrom($color); $b.BorderBrush = [Windows.Media.Brushes]::White; $b.BorderThickness = 1.5; $b.VerticalAlignment = 'Top'; $b.Visibility = 'Collapsed'; $b }

function Anim($o, $p, $a, $b, $ms, $delay, $ease) {
  $x = New-Object Windows.Media.Animation.DoubleAnimation; $x.From = $a; $x.To = $b; $x.Duration = New-Object Windows.Duration ([TimeSpan]::FromMilliseconds($ms))
  $x.BeginTime = [TimeSpan]::FromMilliseconds($delay); if ($ease) { $x.EasingFunction = $ease }; $o.BeginAnimation($p, $x)
}
# A pet (or the chat box) hops up into place.
function Pop($el, $delay, $rise = 26) {
  $t = New-Object Windows.Media.TranslateTransform 0, $rise; $el.RenderTransform = $t; $el.Opacity = 0
  $e = New-Object Windows.Media.Animation.BackEase; $e.Amplitude = 0.7
  Anim $t ([Windows.Media.TranslateTransform]::YProperty) $rise 0 450 $delay $e
  Anim $el ([Windows.UIElement]::OpacityProperty) 0 1 220 $delay $null
}
function Label($text, $size, $color) {
  $nm = New-Object Windows.Controls.TextBlock; $nm.Text = $text; $nm.FontFamily = New-Object Windows.Media.FontFamily 'Malgun Gothic'; $nm.FontSize = $size; $nm.Foreground = $conv.ConvertFrom($color)
  $nm.HorizontalAlignment = 'Center'; $nm.MaxWidth = 90; $nm.TextTrimming = 'CharacterEllipsis'; $nm.IsHitTestVisible = $false
  # Letters only, no background: a soft shadow keeps them readable on any wallpaper.
  $sh = New-Object Windows.Media.Effects.DropShadowEffect; $sh.ShadowDepth = 0; $sh.BlurRadius = 3; $sh.Opacity = 1; $sh.Color = [Windows.Media.Colors]::Black; $nm.Effect = $sh
  $nm
}
function FloorColor($fl) { $i = [array]::IndexOf(@($S.state.floors), $fl); $COLORS[[Math]::Max($i, 0) % $COLORS.Count] }

# One pet: a bubble over an animal, its name under it. Mine (who = '') is bigger and
# carries the dot and the mark; a friend's knows its floor, where a click answers.
function Member($who, $name, $kind, $size, $floor, $panel) {
  # Each slot keeps one width whatever is said: the bubble hangs out over its neighbours
  # (negative margins) instead of widening the slot, so the row and the floor bars stay still.
  # Mine is the last slot, so its bubble hangs out to the left only.
  $W = $size + 22; $over = 180 - $W
  $col = New-Object Windows.Controls.StackPanel; $col.VerticalAlignment = 'Bottom'; $col.Width = $W
  $bub = New-Object Windows.Controls.Border; $bub.Visibility = 'Collapsed'; $bub.Background = $conv.ConvertFrom('#F7FFFFFF'); $bub.CornerRadius = 9
  $bub.Padding = New-Object Windows.Thickness 7, 4, 7, 4; $bub.MaxWidth = 180; $bub.BorderBrush = $conv.ConvertFrom('#30000000'); $bub.BorderThickness = 1
  if ($who) { $bub.Margin = New-Object Windows.Thickness (-$over / 2), 0, (-$over / 2), 2; $bub.HorizontalAlignment = 'Center' }
  else { $bub.Margin = New-Object Windows.Thickness (-$over), 0, 0, 2; $bub.HorizontalAlignment = 'Right' }
  $tb = New-Object Windows.Controls.TextBlock; $tb.TextWrapping = 'Wrap'; $tb.FontFamily = New-Object Windows.Media.FontFamily 'Malgun Gothic'; $tb.FontSize = 12; $tb.Foreground = $conv.ConvertFrom('#2A2340')
  # A picture said to the floor shows small under the words.
  $bi = New-Object Windows.Controls.Image; $bi.MaxWidth = 150; $bi.MaxHeight = 90; $bi.Margin = New-Object Windows.Thickness 0, 3, 0, 0; $bi.Visibility = 'Collapsed'; $bi.HorizontalAlignment = 'Left'
  $bs = New-Object Windows.Controls.StackPanel; [void]$bs.Children.Add($tb); [void]$bs.Children.Add($bi); $bub.Child = $bs
  $g = New-Object Windows.Controls.Grid; $g.Width = $size + 6; $g.Height = $size + 4; $g.Background = $conv.ConvertFrom('#01000000'); $g.Cursor = [Windows.Input.Cursors]::Hand; $g.ToolTip = $name; $g.HorizontalAlignment = 'Center'
  $img = New-Object Windows.Controls.Image; $img.Width = $size; $img.Height = $size; $img.Stretch = 'Fill'; $img.VerticalAlignment = 'Bottom'
  [Windows.Media.RenderOptions]::SetBitmapScalingMode($img, 'NearestNeighbor'); [void]$g.Children.Add($img)
  $m = @{ who = $who; name = $name; frames = (Frames $kind); img = $img; bub = $bub; tb = $tb; col = $col; g = $g; bi = $bi; kind = $kind; floor = $floor; until = [datetime]::MinValue; walkUntil = [datetime]::MinValue; dot = $null; mark = $null; phase = $S.members.Count }
  if (-not $who) { $m.dot = Badge '#E0605A' 10; $m.dot.HorizontalAlignment = 'Right'; [void]$g.Children.Add($m.dot)
    $m.mark = Badge '#F5C542' 12; $m.mark.HorizontalAlignment = 'Left'; [void]$g.Children.Add($m.mark) }
  $g.Tag = $floor; $g.Add_MouseLeftButtonDown({ Press $this.Tag }); $g.ContextMenu = $menu
  # Who this is, for the right-click menu's "✉️ 쪽지".
  $g.DataContext = @{ who = $who; name = $name; floor = $floor }
  # A bubble with a link (Tag) opens it.
  # A note's bubble opens the answer to it (its Tag is the writer, not a link).
  $bub.Add_MouseLeftButtonUp({
    if ($this.Tag -is [hashtable]) { Note-To $this.Tag; $this.Visibility = 'Collapsed' }
    elseif ($this.Tag) { Start-Process $this.Tag; $this.Visibility = 'Collapsed' } })
  $nm = Label $name 10 '#FFFFFF'; $nm.MaxWidth = $W; $m.nm = $nm
  [void]$col.Children.Add($bub); [void]$col.Children.Add($g); [void]$col.Children.Add($nm); [void]$panel.Children.Add($col)
  $m
}
# A chat picture, fetched once from my own server (which gets it from the hub when it is not one).
function Pic($url) {
  if (-not $S.pics) { $S.pics = @{} }
  if (-not $S.pics.ContainsKey($url)) { $b = New-Object Windows.Media.Imaging.BitmapImage; $b.BeginInit(); $b.UriSource = [Uri]"$base$url"; $b.CacheOption = 'OnLoad'; $b.EndInit(); $S.pics[$url] = $b }
  $S.pics[$url]
}
function Say($m, $name, $text, $secs = 8, $open = '', $img = $null, $called = $false) {
  if ($img) { $m.bi.Source = Pic $img; $m.bi.Visibility = 'Visible' } else { $m.bi.Visibility = 'Collapsed' }
  # Called by name (@이름): a yellow bubble with an orange rim, so it reads as "this one is for me";
  # a note (쪽지, $called = 'note'): lilac with a purple rim. Plain talk stays white.
  $tone = if ("$called" -eq 'note') { @('#EDE7FF', '#8B5CF6', 2) } elseif ($called) { @('#FFF4C2', '#F59E0B', 2) } else { @('#F7FFFFFF', '#30000000', 1) }
  $m.bub.Background = $conv.ConvertFrom($tone[0]); $m.bub.BorderBrush = $conv.ConvertFrom($tone[1]); $m.bub.BorderThickness = $tone[2]
  $m.bub.Tag = $open; $m.bub.Cursor = $(if ($open) { [Windows.Input.Cursors]::Hand } else { $null })
  # The name sits on its own small coloured line above the words.
  $m.tb.Inlines.Clear(); $r = New-Object Windows.Documents.Run $name; $r.FontWeight = [Windows.FontWeights]::Bold; $r.FontSize = 10.5; $r.Foreground = $conv.ConvertFrom('#6C5CE7')
  $m.tb.Inlines.Add($r); $m.tb.Inlines.Add((New-Object Windows.Documents.LineBreak)); $m.tb.Inlines.Add((New-Object Windows.Documents.Run $text))
  # Bubbles hang over the neighbours, so only the newest talk shows; the chat keeps the rest.
  # A bubble that opens something (a note) stays until it times out.
  foreach ($o in @($S.members.Values)) { if ($o -ne $m -and -not $o.bub.Tag) { $o.bub.Visibility = 'Collapsed' } }
  $m.bub.Visibility = 'Visible'; $m.until = (Get-Date).AddSeconds($secs)
}
# The cast changes when someone comes or goes, or picks another animal. On several
# floors each floor's people sit in their own group over a bar in its colour and
# its name; mine sits apart at the right end. Newcomers hop in.
function Cast($st) {
  $sig = (@($st.friends | ForEach-Object { "$($_.floor)|$($_.who)=$($_.kind)" }) + "me=$($st.kind)") -join ','
  if ($sig -eq $S.cast) { return }; $S.cast = $sig
  $many = @($st.floors).Count -gt 1; $old = $S.members
  $ui.Row.Children.Clear(); $S.members = [ordered]@{}; $S.rows = @{}; $i = -1
  foreach ($fl in @($st.floors)) {
    $i++; $here = @($st.friends | Where-Object { $_.floor -eq $fl }); if (-not $here.Count) { continue }
    $grp = New-Object Windows.Controls.StackPanel; $grp.VerticalAlignment = 'Bottom'; $grp.Margin = New-Object Windows.Thickness 3, 0, 5, 0
    $row = New-Object Windows.Controls.StackPanel; $row.Orientation = 'Horizontal'; $row.HorizontalAlignment = 'Center'; [void]$grp.Children.Add($row)
    if ($many) { $c = $COLORS[$i % $COLORS.Count]
      $bar = New-Object Windows.Controls.Border; $bar.Height = 3; $bar.CornerRadius = 1.5; $bar.Background = $conv.ConvertFrom($c); $bar.Margin = New-Object Windows.Thickness 4, 1, 4, 0
      [void]$grp.Children.Add($bar); [void]$grp.Children.Add((Label $fl 10 $c)) }
    foreach ($f in $here) { $S.members["$fl|$($f.who)"] = Member $f.who $f.name $f.kind 36 $fl $row }
    $S.rows[$fl] = $row
    [void]$ui.Row.Children.Add($grp)
  }
  $S.members[''] = Member '' '나' $st.kind 48 '' $ui.Row
  # While I walk out of the door, the other floors' groups wait (bars and names too,
  # or the window is wide and the door far off) to hop in when I arrive.
  if ($S.fly) { foreach ($c in @($ui.Row.Children)) { if ($c -ne $S.members[''].col) { $c.Visibility = 'Collapsed' } }; return }
  # Someone who comes in while I am here walks in through a door by their floor's group;
  # a first cast (nobody here before) just hops in.
  $d = 0; foreach ($k in @($S.members.Keys)) {
    if ($old.Contains($k)) { continue }
    if ($k -and $old.Count) { Enter-Door $S.members[$k] }
    else { Pop $S.members[$k].col $d; $d += 90 }
  }
  foreach ($k in @($old.Keys)) { if ($k -and -not $S.members.Contains($k)) { Leave-Door $old[$k] } }
}

# The bottom-right corner stays where it was put while bubbles and friends come and go.
$S.right = [Windows.SystemParameters]::WorkArea.Right - 12; $S.bottom = [Windows.SystemParameters]::WorkArea.Bottom - 4
function Anchor { if ($S.fly) { return }; $w.Left = $S.right - $w.ActualWidth; $w.Top = $S.bottom - $w.ActualHeight }
$w.Add_SizeChanged({ Anchor })
# The corner kept from last time may be on a monitor that is gone now (a laptop off its dock):
# when no screen has it, the pets come back to the main screen's bottom right. Checked at start
# and whenever the monitors change. (Screens are in device pixels, the corner in WPF's units.)
function Fit-Screen {
  $k = 1.0
  try { $src = [Windows.PresentationSource]::FromVisual($w); if ($src) { $k = $src.CompositionTarget.TransformToDevice.M11 } } catch {}
  if (-not $k) { $k = [double][Windows.SystemParameters]::PrimaryScreenWidth; $k = [Windows.Forms.Screen]::PrimaryScreen.Bounds.Width / $k }
  $px = [int](($S.right - 30) * $k); $py = [int](($S.bottom - 20) * $k)
  $seen = $false
  foreach ($sc in [Windows.Forms.Screen]::AllScreens) { if ($sc.WorkingArea.Contains($px, $py)) { $seen = $true; break } }
  if ($seen) { return $false }
  $S.right = [Windows.SystemParameters]::WorkArea.Right - 12; $S.bottom = [Windows.SystemParameters]::WorkArea.Bottom - 4
  Anchor; Call '/api/pet' @{ x = [int]$S.right; y = [int]$S.bottom } | Out-Null
  $true
}
[Microsoft.Win32.SystemEvents]::add_DisplaySettingsChanged({ $w.Dispatcher.BeginInvoke([Action] { [void](Fit-Screen); Place-Fx }) | Out-Null })

# Size: the whole row (pets, names, bubbles, doors) zooms as one, so it stays crisp and in
# proportion. Dragging the grip up-left makes it bigger, down-right smaller; Ctrl+wheel too.
# The size is saved on release, so it comes back next time.
$S.zoom = New-Object Windows.Media.ScaleTransform 1, 1; $ui.Row.LayoutTransform = $S.zoom; $S.k = 1.0
function Zoom($k) {
  $k = [Math]::Max(0.5, [Math]::Min(1.6, [double]$k)); $S.k = $k
  $S.zoom.ScaleX = $k; $S.zoom.ScaleY = $k
}
function Save-Zoom { Call '/api/pet' @{ scale = [Math]::Round($S.k, 2) } | Out-Null }

# The chat box on its own: width and the height of its lines, dragged by the chip at its top
# left, and how see-through it is (right-click menu). Pop animates the box's own Opacity, so
# the see-through level goes on its background and its inside instead.
$S.chatW = 250; $S.chatH = 160; $S.chatA = 1.0
function Chat-Size($cw, $ch, $ca) {
  $S.chatW = [Math]::Max(220, [Math]::Min(560, [double]$cw)); $S.chatH = [Math]::Max(80, [Math]::Min(600, [double]$ch)); $S.chatA = [Math]::Max(0.3, [Math]::Min(1, [double]$ca))
  if ($S.chatBar -and [Math]::Abs($S.chatBar.Value - $S.chatA * 100) -gt 0.5) { $S.chatBar.Value = $S.chatA * 100 }
  $ui.ChatBox.Width = $S.chatW; $ui.LinesBox.Height = $S.chatH; $ui.ChatBody.Opacity = $S.chatA; $ui.Tabs.Opacity = $S.chatA
  $c = if ($S.noteTo) { @(0x2A, 0x22, 0x3E) } else { @(0x1E, 0x1B, 0x2E) }
  $ui.ChatBox.Background = New-Object Windows.Media.SolidColorBrush ([Windows.Media.Color]::FromArgb([byte][Math]::Round(242 * $S.chatA), $c[0], $c[1], $c[2]))
}
function Save-Chat { Call '/api/pet' @{ chatW = [Math]::Round($S.chatW); chatH = [Math]::Round($S.chatH); chatAlpha = $S.chatA } | Out-Null }
# New lines (and pictures as they arrive) keep the newest in view.
$ui.Lines.Add_SizeChanged({ $ui.LinesBox.ScrollToEnd() })
$ui.ChatGrip.Add_MouseEnter({ $this.Opacity = 1 })
$ui.ChatGrip.Add_MouseLeave({ if (-not $S.crz) { $this.Opacity = 0.35 } })
$ui.ChatGrip.Add_MouseLeftButtonDown({
  $p = [Windows.Forms.Cursor]::Position; $S.crz = @{ x = $p.X; y = $p.Y; w = $S.chatW; h = $S.chatH }
  [void]$this.CaptureMouse(); $_.Handled = $true })
$ui.ChatGrip.Add_MouseMove({
  if (-not $S.crz) { return }
  # Screen pixels to the box's own units, so the corner follows the mouse on a scaled display.
  $p = [Windows.Forms.Cursor]::Position; $dpi = [Windows.Media.VisualTreeHelper]::GetDpi($w).DpiScaleX
  Chat-Size ($S.crz.w + ($S.crz.x - $p.X) / $dpi) ($S.crz.h + ($S.crz.y - $p.Y) / $dpi) $S.chatA })
$ui.ChatGrip.Add_MouseLeftButtonUp({
  if (-not $S.crz) { return }
  $this.ReleaseMouseCapture(); $S.crz = $null; $this.Opacity = 0.35; Save-Chat; $ui.LinesBox.ScrollToEnd() })
$w.Add_MouseEnter({ $ui.Grip.Opacity = 1 })
$w.Add_MouseLeave({ if (-not $S.rz) { $ui.Grip.Opacity = 0.02 } })
$ui.Grip.Add_MouseLeftButtonDown({
  $p = [Windows.Forms.Cursor]::Position; $S.rz = @{ x = $p.X; y = $p.Y; k = $S.k }
  [void]$this.CaptureMouse(); $_.Handled = $true })
$ui.Grip.Add_MouseMove({
  if (-not $S.rz) { return }
  $p = [Windows.Forms.Cursor]::Position
  Zoom ($S.rz.k * (1 + (($S.rz.x - $p.X) + ($S.rz.y - $p.Y)) / 300.0)) })
$ui.Grip.Add_MouseLeftButtonUp({
  if (-not $S.rz) { return }
  $this.ReleaseMouseCapture(); $S.rz = $null; Save-Zoom
  if (-not $w.IsMouseOver) { $ui.Grip.Opacity = 0.02 } })
$w.Add_PreviewMouseWheel({
  if (-not ([Windows.Input.Keyboard]::Modifiers -band [Windows.Input.ModifierKeys]::Control)) { return }
  Zoom ($S.k * $(if ($_.Delta -gt 0) { 1.08 } else { 1 / 1.08 })); Save-Zoom; $_.Handled = $true })

# On start a little door rises on the taskbar a way off, swings open, and I walk out
# of it to my place; it shuts behind me and my friends hop in.
$fly = New-Object Windows.Threading.DispatcherTimer; $fly.Interval = [TimeSpan]::FromMilliseconds(15)
$fly.Add_Tick({
  # 1.0, not 1: [Math]::Min(1, 0.4) picks the integer overload and gives 0, a teleport.
  $t = [Math]::Max(0.0, [Math]::Min(1.0, ((Get-Date) - $S.t0).TotalMilliseconds / $S.walkMs))
  $S.walking = $t -gt 0 -and $t -lt 1
  # Steady walking pace, easing only into the first and out of the last steps.
  $e = if ($t -lt 0.15) { $t * $t / 0.3 } elseif ($t -gt 0.85) { 0.925 - (1 - $t) * (1 - $t) / 0.3 } else { $t - 0.075 }
  $e = $e / 0.925
  $tx = $S.right - $w.ActualWidth; $ty = $S.bottom - $w.ActualHeight
  # A step every ~18 px: a small bob, not a hop.
  $bob = 3 * [Math]::Abs([Math]::Sin([Math]::PI * $t * $S.steps))
  $w.Left = $S.fx + ($tx - $S.fx) * $e; $w.Top = $S.fy + ($ty - $S.fy) * $e - $bob
  if ($t -ge 1) { $fly.Stop(); Land }
})
# Runs $do (given $arg) once, $ms from now. Script blocks do not keep the variables
# around them, so whatever $do needs rides along as $arg.
function After($ms, $do, $arg) {
  $tm = New-Object Windows.Threading.DispatcherTimer; $tm.Interval = [TimeSpan]::FromMilliseconds($ms); $tm.Tag = @($do, $arg)
  $tm.Add_Tick({ $this.Stop(); & $this.Tag[0] $this.Tag[1] }); $tm.Start()
}
# A door is its own window, so it stays put while a pet walks away from it. A new window
# takes a moment (up to ~2 s) to first draw, so everything is timed from that first draw:
# it rises, swings open, $out runs (with $arg) to bring the pet out, then it shuts and sinks.
function DoorVisual($wd = 44, $ht = 60) {
  $frame = New-Object Windows.Controls.Border; $frame.Width = $wd; $frame.Height = $ht; $frame.Background = $conv.ConvertFrom('#6B3F1F'); $frame.CornerRadius = New-Object Windows.CornerRadius 20, 20, 2, 2; $frame.Padding = New-Object Windows.Thickness 4, 4, 4, 0
  $g = New-Object Windows.Controls.Grid; $frame.Child = $g
  $light = New-Object Windows.Controls.Border; $light.Background = $conv.ConvertFrom('#FFD98A'); $light.CornerRadius = New-Object Windows.CornerRadius 16, 16, 0, 0; [void]$g.Children.Add($light)
  $leaf = New-Object Windows.Controls.Border; $leaf.Background = $conv.ConvertFrom('#C9773A'); $leaf.CornerRadius = New-Object Windows.CornerRadius 16, 16, 0, 0
  $leaf.BorderBrush = $conv.ConvertFrom('#8A4B22'); $leaf.BorderThickness = 1.5; $leaf.RenderTransformOrigin = New-Object Windows.Point 0, 0.5
  $knob = New-Object Windows.Shapes.Ellipse; $knob.Width = 5; $knob.Height = 5; $knob.Fill = $conv.ConvertFrom('#FFE066'); $knob.HorizontalAlignment = 'Right'; $knob.Margin = New-Object Windows.Thickness 0, 8, 5, 0
  $leaf.Child = $knob; [void]$g.Children.Add($leaf)
  $swing = New-Object Windows.Media.ScaleTransform 1, 1; $leaf.RenderTransform = $swing
  $grow = New-Object Windows.Media.ScaleTransform 1, 0; $frame.RenderTransform = $grow; $frame.RenderTransformOrigin = New-Object Windows.Point 0.5, 1
  @{ el = $frame; grow = $grow; swing = $swing }
}
function Door($cx, $bottom, $out, $arg) {
  $d = New-Object Windows.Window; $d.WindowStyle = 'None'; $d.AllowsTransparency = $true; $d.Background = [Windows.Media.Brushes]::Transparent
  $d.Topmost = $true; $d.ShowInTaskbar = $false; $d.ShowActivated = $false; $d.ResizeMode = 'NoResize'; $d.SizeToContent = 'WidthAndHeight'
  $k = DoorVisual; $d.Content = $k.el; $d.Left = $cx - 22; $d.Top = $bottom - 60
  $k.out = $out; $k.arg = $arg; $k.win = $d; $k.done = { param($k) $k.win.Close() }; $d.Tag = $k
  $d.Add_ContentRendered({ Open-Door $this.Tag }); $d.Show()
}
function Open-Door($k) {
  # The pets' window back on top of the door's, so they come out in front of it.
  $w.Topmost = $false; $w.Topmost = $true
  $back = New-Object Windows.Media.Animation.BackEase; $back.Amplitude = 0.5
  Anim $k.grow ([Windows.Media.ScaleTransform]::ScaleYProperty) 0 1 320 0 $back
  Anim $k.swing ([Windows.Media.ScaleTransform]::ScaleXProperty) 1 0.12 300 450 $null
  & $k.out $k.arg
  # Shut once the pet is a few steps out, then sink away. Started later rather than with
  # a BeginTime: a second animation on the same property replaces the first at once.
  After 1850 { param($k) Anim $k.swing ([Windows.Media.ScaleTransform]::ScaleXProperty) 0.12 1 250 0 $null } $k
  After 2250 { param($k) Anim $k.grow ([Windows.Media.ScaleTransform]::ScaleYProperty) 1 0 260 0 $null } $k
  After 2600 { param($k) & $k.done $k } $k
}
# Me: I show up in the doorway and walk the window over to my place.
function Me-Out { After 800 { Pop $S.members[''].col 0 6 }; $S.t0 = (Get-Date).AddMilliseconds(1150); $fly.Start() }
# A friend who comes in: a door rises right where they will sit, behind them, in this
# window (a door window of its own would cover the pets next to it), and they step out.
function Enter-Door($m) {
  # A smaller door than mine, so its top stays inside the window over the row.
  $k = DoorVisual 38 50; $box = New-Object Windows.Controls.Canvas; $box.IsHitTestVisible = $false
  [Windows.Controls.Canvas]::SetLeft($k.el, ($m.g.Width - 38) / 2); [Windows.Controls.Canvas]::SetTop($k.el, $m.g.Height - 50)
  [void]$box.Children.Add($k.el); $m.g.Children.Insert(0, $box)
  $m.img.Opacity = 0; $m.nm.Opacity = 0
  $k.out = { param($m) After 800 { param($m) Step-Out $m } $m }; $k.arg = $m
  $k.host = $m.g; $k.box = $box; $k.done = { param($k) $k.host.Children.Remove($k.box) }
  Open-Door $k
}
# Out of the doorway towards me: small at the back, full size at the front, a few steps.
function Step-Out($m) {
  $sc = New-Object Windows.Media.ScaleTransform 0.6, 0.6; $m.img.RenderTransformOrigin = New-Object Windows.Point 0.5, 1; $m.img.RenderTransform = $sc
  Anim $m.img ([Windows.UIElement]::OpacityProperty) 0 1 200 0 $null
  Anim $sc ([Windows.Media.ScaleTransform]::ScaleXProperty) 0.6 1 600 0 $null
  Anim $sc ([Windows.Media.ScaleTransform]::ScaleYProperty) 0.6 1 600 0 $null
  Anim $m.nm ([Windows.UIElement]::OpacityProperty) 0 1 300 400 $null
  $m.walkUntil = (Get-Date).AddMilliseconds(700)
}
# Someone who left: a stand-in for them stays in their floor's group (or a spot of its
# own if they were its last) while a door opens behind them and they step back in.
function Leave-Door($o) {
  $at = $S.rows[$o.floor]; $spot = $null
  if (-not $at) { $spot = New-Object Windows.Controls.StackPanel; $spot.Orientation = 'Horizontal'; $spot.VerticalAlignment = 'Bottom'; $ui.Row.Children.Insert([Math]::Max(0, $ui.Row.Children.Count - 1), $spot); $at = $spot }
  $m = Member $o.who $o.name $o.kind 36 $o.floor $at; $m.g.IsHitTestVisible = $false; $m.img.Source = $m.frames[0]
  $k = DoorVisual 38 50; $box = New-Object Windows.Controls.Canvas; $box.IsHitTestVisible = $false
  [Windows.Controls.Canvas]::SetLeft($k.el, ($m.g.Width - 38) / 2); [Windows.Controls.Canvas]::SetTop($k.el, $m.g.Height - 50)
  [void]$box.Children.Add($k.el); $m.g.Children.Insert(0, $box)
  $k.out = { param($m) After 800 { param($m) Step-In $m } $m }; $k.arg = $m
  $k.gone = if ($spot) { $spot } else { $m.col }; $k.from = if ($spot) { $ui.Row } else { $at }
  $k.done = { param($k) [void]$k.from.Children.Remove($k.gone) }
  Open-Door $k
}
function Step-In($m) {
  $sc = New-Object Windows.Media.ScaleTransform 1, 1; $m.img.RenderTransformOrigin = New-Object Windows.Point 0.5, 1; $m.img.RenderTransform = $sc
  Anim $sc ([Windows.Media.ScaleTransform]::ScaleXProperty) 1 0.6 600 0 $null
  Anim $sc ([Windows.Media.ScaleTransform]::ScaleYProperty) 1 0.6 600 0 $null
  Anim $m.img ([Windows.UIElement]::OpacityProperty) 1 0 250 400 $null
  Anim $m.nm ([Windows.UIElement]::OpacityProperty) 1 0 300 0 $null
}
function Fly {
  $S.fly = $true; $w.UpdateLayout(); $S.members[''].col.Opacity = 0
  # The door stands a short walk left of my place, on the same line, so I walk straight across.
  $wa = [Windows.SystemParameters]::WorkArea
  $S.fx = [Math]::Max($wa.Left + 40, $S.right - $w.ActualWidth - 170); $S.fy = $S.bottom - $w.ActualHeight
  $w.Left = $S.fx; $w.Top = $S.fy
  $dist = $S.right - $w.ActualWidth - $S.fx
  $S.walkMs = [Math]::Max(1300.0, $dist / 0.13); $S.steps = [Math]::Max(4, [Math]::Round($dist / 18))
  # Its sill at my feet: the name under me takes the last ~13 px of my window.
  Door ($S.fx + $w.ActualWidth - 27) ($S.bottom - 13) { Me-Out } $null
}
function Land {
  $S.fly = $false; foreach ($c in @($ui.Row.Children)) { $c.Visibility = 'Visible' }; Anchor; $d = 120
  foreach ($k in @($S.members.Keys)) { if ($k) { Pop $S.members[$k].col $d; $d += 90 } }
  Say $S.members[''] '나' '왔어요!' 3
}

# On several floors the chat shows one floor at a time, the one named over the input
# in its colour: the floor of the pet I clicked, or the last one spoken to me.
function Floors { @($S.state.floors) }
function Show-Chat {
  Render-Tabs
  if ($S.noteTo) { return Show-Notes }
  $many = (Floors).Count -gt 1
  $lines = @($S.state.chat | Where-Object { -not $many -or $_.floor -eq (To) } | Select-Object -Last 30)
  # Rebuilt only when the lines change, not on every poll, so pictures do not flicker.
  $sig = "$(To)|" + (@($lines | ForEach-Object { $_.id }) -join ',')
  if ($sig -eq $S.linesSig) { return }; $S.linesSig = $sig
  $ui.Lines.Children.Clear()
  if (-not $lines.Count) {
    $t = if ($many) { "이 층은 아직 조용합니다. 여기 적으면 $(To) 층에 올라갑니다." } else { '아직 대화가 없습니다. 여기 적으면 팀 층에 올라갑니다. 이미지는 Ctrl+V' }
    [void]$ui.Lines.Children.Add((ChatLine $t)); return
  }
  foreach ($l in $lines) {
    [void]$ui.Lines.Children.Add((ChatLine $l.text $(if ($l.mine) { '나' } else { $l.name }) $l.mine ([bool]$l.me)))
    if ($l.img) {
      $im = New-Object Windows.Controls.Image; $im.Source = Pic $l.img; $im.MaxWidth = $S.chatW - 50; $im.MaxHeight = 110; $im.HorizontalAlignment = 'Left'
      $im.Margin = New-Object Windows.Thickness 0, 2, 0, 4; $im.Cursor = [Windows.Input.Cursors]::Hand; $im.Tag = "$base$($l.img)"; $im.ToolTip = '눌러서 크게 보기'
      $im.Add_MouseLeftButtonUp({ Start-Process $this.Tag }); [void]$ui.Lines.Children.Add($im)
    }
  }
}
# The name in its own colour (mine green, others violet) so it does not run into the words.
function ChatLine($text, $name = $null, $mine = $false, $called = $false) {
  $t = New-Object Windows.Controls.TextBlock; $t.TextWrapping = 'Wrap'; $t.FontFamily = New-Object Windows.Media.FontFamily 'Malgun Gothic'; $t.FontSize = 12
  # A line that calls me by name stands out in yellow.
  $t.Foreground = $conv.ConvertFrom($(if ($called) { '#FFD84D' } else { '#F1EEFC' })); $t.Margin = New-Object Windows.Thickness 0, 0, 0, 3
  if ($called) { $t.FontWeight = [Windows.FontWeights]::SemiBold }
  if ($name) { $r = New-Object Windows.Documents.Run "$name  "; $r.FontWeight = [Windows.FontWeights]::Bold; $r.FontSize = 11
    $r.Foreground = $conv.ConvertFrom($(if ($mine) { '#7FDCA4' } else { '#B3A6FF' })); $t.Inlines.Add($r) }
  $t.Inlines.Add((New-Object Windows.Documents.Run $text)); $t
}
function Toggle-Chat($open) {
  if ($open) {
    if (-not $S.pick) { $S.pick = $S.floor }
    $was = $ui.Chat.Visibility -eq 'Visible'; Show-Chat; $ui.Chat.Visibility = 'Visible'; if (-not $was) { Pop $ui.Chat 0 10 }
    $S.members[''].dot.Visibility = 'Collapsed'; $w.Activate(); [void]$ui.Input.Focus()
  } else { $ui.Chat.Visibility = 'Collapsed'; $S.pick = $null; $S.linesSig = ''; $S.armed = $false; Drop-Pic }
}
function To { if ($S.pick) { $S.pick } else { $S.floor } }

# ✉️ 쪽지 and the floor's talk are two tabs over the lines, so where Enter goes is never a
# guess: the note tab turns the whole box violet, and the empty box says who will read it.
# A note stays until its tab is left or its ✕ pressed (closing the chat keeps it); right
# after going back to the floor, the first Enter only asks (see Send-Line).
$S.tabSig = ''; $S.armed = $false; $S.warnUntil = [datetime]::MinValue
function Floor-Count($fl) { @($S.state.friends | Where-Object { $_.floor -eq $fl }).Count + 1 }
# A folder tab under the box: the open one in the box's own colour, joined to it; the other
# one darker and quieter. Their see-through level follows the box's (Chat-Size).
function Tab($text, $on, $color, $tip) {
  $b = New-Object Windows.Controls.Border; $b.CornerRadius = New-Object Windows.CornerRadius 0, 0, 8, 8
  $b.Padding = New-Object Windows.Thickness 10, 3, 10, 5; $b.Margin = New-Object Windows.Thickness 0, 0, 3, 0; $b.Cursor = [Windows.Input.Cursors]::Hand; $b.ToolTip = $tip
  $b.Background = $conv.ConvertFrom($(if ($on) { $color } else { '#F2131120' }))
  $t = New-Object Windows.Controls.TextBlock; $t.FontFamily = New-Object Windows.Media.FontFamily 'Malgun Gothic'; $t.FontSize = 11
  if ($on) { $t.FontWeight = [Windows.FontWeights]::Bold }
  $t.Foreground = $conv.ConvertFrom($(if ($on) { '#F1EEFC' } else { '#8F86B8' })); $t.Text = $text; $b.Child = $t; $b
}
function To-Floor { if ($S.noteTo) { $S.noteTo = $null; $S.warnUntil = (Get-Date).AddSeconds(30) }; $S.armed = $false; $S.linesSig = ''; Show-Chat; [void]$ui.Input.Focus() }
function Render-Tabs {
  $note = $S.noteTo; $fl = To; $n = Floor-Count $fl; $many = (Floors).Count -gt 1
  $sig = "$($note.who)|$($S.noteTab.who)|$fl|$n|$many|$($S.armed)"
  if ($sig -eq $S.tabSig) { return }; $S.tabSig = $sig
  $ui.Tabs.Children.Clear()
  $ft = Tab "📢 $fl 전체 · $($n)명$(if ($many) { ' ▸' })" (-not $note) '#F21E1B2E' $(if ($many) { '눌러서 층 대화로 · 다시 누르면 다음 층' } else { '눌러서 층 대화로' })
  $ft.Add_MouseLeftButtonUp({
    if ($S.noteTo -or (Floors).Count -lt 2) { To-Floor; return }
    $f = Floors; $i = [array]::IndexOf($f, (To)); $S.pick = $f[($i + 1) % $f.Count]; $S.linesSig = ''; Show-Chat })
  [void]$ui.Tabs.Children.Add($ft)
  if ($S.noteTab) {
    $nt = Tab "✉️ $($S.noteTab.name)" ([bool]$note) '#F22A223E' "$($S.noteTab.name) 님에게만 가는 쪽지"
    $row = New-Object Windows.Controls.StackPanel; $row.Orientation = 'Horizontal'; $lbl = $nt.Child; $nt.Child = $row; [void]$row.Children.Add($lbl)
    $x = New-Object Windows.Controls.TextBlock; $x.Text = '  ✕'; $x.FontSize = 10; $x.Foreground = $lbl.Foreground; $x.VerticalAlignment = 'Center'; $x.ToolTip = '쪽지 탭 닫기'
    $x.Add_MouseLeftButtonUp({ $S.noteTab = $null; To-Floor; $_.Handled = $true }); [void]$row.Children.Add($x)
    $nt.Add_MouseLeftButtonUp({ if (-not $S.noteTo) { $S.noteTo = $S.noteTab; $S.armed = $false; $S.linesSig = ''; Show-Chat; [void]$ui.Input.Focus() } })
    [void]$ui.Tabs.Children.Add($nt)
  }
  $ui.Input.BorderBrush = $conv.ConvertFrom($(if ($note) { '#5E5486' } else { '#4A4470' }))
  $ui.Input.Background = $conv.ConvertFrom($(if ($note) { '#33294D' } else { '#2A2640' }))
  $ui.Hint.Text = if ($note) { "🔒 $($note.name) 님에게만 보입니다" } else { "📢 $fl 층 $($n)명 모두에게 보입니다" }
  $ui.Target.Visibility = if ($S.armed) { 'Visible' } else { 'Collapsed' }
  if ($S.armed) { $ui.Target.Foreground = $conv.ConvertFrom('#FFD84D'); $ui.Target.Text = "📢 $fl 층 $($n)명 모두에게 보냅니다. 맞으면 Enter 한 번 더 (쪽지는 아래 ✉️ 탭)" }
  Chat-Size $S.chatW $S.chatH $S.chatA
}
$ui.Input.Add_TextChanged({ $ui.Hint.Visibility = if ($ui.Input.Text) { 'Collapsed' } else { 'Visible' } })
# Drag any pet to move them all. A click on a friend opens that floor's chat (again: closes it);
# a click on mine opens or closes the chat.
function Press($floor) {
  # ❄️ A dodge long past its ball is let go, so nothing can keep my clicks from my pet.
  if (-not $floor -and $S.sbDodge -and ((Get-Date) - $S.sbDodge.t0).TotalMilliseconds -gt $S.sbDodge.win1 + 3000) { $S.sbDodge = $null }
  # 🎣 A bite on my line comes first: nothing else may take that click (the hub hears how many
  # clicks my pet got while the line was in, so a bite let go can be told from a click lost).
  if (-not $floor -and $S.fish) {
    $S.fish.presses = 1 + [int]$S.fish.presses
    if ($S.fish.state -eq 'bite') { Fish-Reel; return }
  }
  # ❄️ A ball coming at me: the click on my pet is the dodge.
  if (-not $floor -and $S.sbDodge) { Sb-Dodge; return }
  # A click on my pet while my line is in reels it in (no drag then).
  if (-not $floor -and $S.fish) { if ($S.fish.state -eq 'fight') { Fight-Click } elseif ($S.fish.state -in 'wait', 'bite') { Fish-Reel }; return }
  $S.down = [Windows.Forms.Cursor]::Position; $w.DragMove(); $p = [Windows.Forms.Cursor]::Position
  if ([Math]::Abs($p.X - $S.down.X) + [Math]::Abs($p.Y - $S.down.Y) -gt 4) {
    $S.right = $w.Left + $w.ActualWidth; $S.bottom = $w.Top + $w.ActualHeight
    Call '/api/pet' @{ x = [int]$S.right; y = [int]$S.bottom }
  } elseif ($floor) {
    if ($ui.Chat.Visibility -eq 'Visible' -and ($S.noteTo -or (To) -eq $floor)) { Toggle-Chat $false } else { if (-not $S.noteTo) { $S.pick = $floor }; $S.linesSig = ''; Toggle-Chat $true }
  } else { Toggle-Chat ($ui.Chat.Visibility -ne 'Visible') }
}
# While Korean is being composed, Enter arrives as ImeProcessed and the last syllable is not in Text yet:
# send after the IME commits it. A failed send keeps the text so nothing typed is lost.
function Send-Line {
  $t = $ui.Input.Text.Trim(); if (-not ($t -or $S.pend)) { return }
  if (-not $S.armed) { $ui.Target.Visibility = 'Collapsed' }
  # 🎆 "/폭죽" and the like play for the floor I am talking to (server/team.js FX), whichever
  # tab is open; "/명령" lists what there is, here only.
  if ($t -match '^/(명령|도움|help)$') { Info '명령: /낚시 (찌가 쑥 들어가면 펫 클릭!) /도감 /강화 /낚시대회 · /폭죽 /박수 /하트 /ㅋㅋ /춤 (같이 추기) · /눈사람 (다 같이) · /비 /눈 (다 같이 우산, /우산 은 빙글) · /r 답장 · /쪽지 이름 할 말'; $ui.Input.Text = ''; return }
  # 🎣 /낚시 casts from my pet, /도감 opens the picture book (here only, nothing is said).
  if ($t -match '^/(낚시|낚싯대)$') { $ui.Input.Text = ''; Fish-Go; return }
  if ($t -match '^/낚시\s*대회$') { $ui.Input.Text = ''; Contest-Do @{ op = 'contest-open' }; return }
  if ($t -match '^/(도감|물고기)$') { $ui.Input.Text = ''; Book-Open; return }
  if ($t -match '^/강화$') { $ui.Input.Text = ''; Forge-Open; return }
  if ($t -match '^/(\S+)$' -and $FX_CMDS -contains $Matches[1]) {
    if (-not (To)) { return }
    $r = Ask '/api/chat' @{ floor = (To); text = $t }
    if ($r.error) { Warn "⚠ $($r.error)" } else { $ui.Input.Text = '' }
    return
  }
  if ($t -match '^/[^\s/]+$' -and $t -notmatch '^/(r|w|쪽지)$') { Warn '⚠ 모르는 명령이에요 — /명령 으로 목록을 볼 수 있어요'; return }
  # "/r 할 말" answers the last note I got; "/쪽지 이름 할 말" (or "/w") writes to someone here.
  if ($t -match '^/(r|w|쪽지)(?:\s+|$)(.*)$') {
    $cmd = $Matches[1]; $rest = $Matches[2]
    $to = if ($cmd -eq 'r') { Last-NoteFrom } else { Person-Named (($rest -split '\s+')[0]) }
    if (-not $to) { Warn $(if ($cmd -eq 'r') { '⚠ 답장할 쪽지가 없습니다' } else { '⚠ 이 층에 그 이름의 사람이 없습니다' }); return }
    $S.noteTo = $to; $S.noteTab = $to; $S.armed = $false; $S.linesSig = ''
    $t = if ($cmd -eq 'r') { $rest.Trim() } else { ($rest -replace '^\S+\s*', '').Trim() }
    if (-not ($t -or $S.pend)) { $ui.Input.Text = ''; Show-Chat; return }
  }
  if ($S.noteTo) {
    $body = @{ floor = $S.noteTo.floor; to = $S.noteTo.who; toName = $S.noteTo.name; text = $t }; if ($S.pend) { $body.image = $S.pend }
    if (Call '/api/note' $body) { $ui.Input.Text = ''; Drop-Pic } else { Warn "⚠ $($S.noteTo.name) 님에게 쪽지를 보내지 못했습니다 (지금 그 층에 없을 수 있어요)" }
    return
  }
  if (-not (To)) { return }
  if ((Get-Date) -lt $S.warnUntil -and -not $S.armed) { $S.armed = $true; Render-Tabs; return }
  $S.armed = $false; $S.warnUntil = [datetime]::MinValue
  $body = @{ floor = (To); text = $t }; if ($S.pend) { $body.image = $S.pend }
  if (Call '/api/chat' $body) { $ui.Input.Text = ''; Drop-Pic } elseif ($S.pend) { Pic-Fail '서버가 받지 않음' }
  Render-Tabs
}

# ✉️ 쪽지: to one person only (the server hands it to their PC alone). While I write one,
# the top line says to whom and shows our notes, and the box's rim turns purple; a click on
# that line goes back to the floor's talk.
function Last-NoteFrom {
  $n = @($S.state.notes | Where-Object { $_.dir -eq 'in' }) | Select-Object -Last 1
  if ($n) { @{ who = $n.who; name = $n.name; floor = $n.floor } }
}
function Person-Named($word) {
  $w = "$word".TrimStart('@').ToLower(); if (-not $w) { return }
  $m = @($S.members.Values | Where-Object { $_.who -and $_.floor -eq (To) -and ($_.name.ToLower() -eq $w -or ($_.name -split '[\s(]')[0].ToLower() -eq $w) }) | Select-Object -First 1
  if ($m) { @{ who = $m.who; name = $m.name; floor = $m.floor } }
}
function Note-To($to) {
  $S.noteTo = $to; $S.noteTab = $to; $S.armed = $false; $S.linesSig = ''; Toggle-Chat $true
  # From the right-click menu: the closing menu hands the keyboard back to the pet it
  # opened on, so the box takes it again a moment later.
  After 80 { $w.Activate(); [void]$ui.Input.Focus(); [void][Windows.Input.Keyboard]::Focus($ui.Input) } $null
}
function Show-Notes {
  $to = $S.noteTo
  $lines = @($S.state.notes | Where-Object { $_.who -eq $to.who } | Select-Object -Last 10)
  $sig = "note|$($to.who)|" + (@($lines | ForEach-Object { $_.id }) -join ',')
  if ($sig -eq $S.linesSig) { return }; $S.linesSig = $sig
  $ui.Lines.Children.Clear()
  if (-not $lines.Count) { [void]$ui.Lines.Children.Add((ChatLine "여기 적으면 $($to.name) 님에게만 갑니다. 다른 사람에게는 보이지 않아요.")); return }
  foreach ($l in $lines) {
    $line = ChatLine $l.text $(if ($l.dir -eq 'out') { '나' } else { $l.name }) ($l.dir -eq 'out')
    if ($l.dir -eq 'in') { $line.Foreground = $conv.ConvertFrom('#DDD2FF') }
    [void]$ui.Lines.Children.Add($line)
    if ($l.img) {
      $im = New-Object Windows.Controls.Image; $im.Source = Pic $l.img; $im.MaxWidth = $S.chatW - 50; $im.MaxHeight = 110; $im.HorizontalAlignment = 'Left'
      $im.Margin = New-Object Windows.Thickness 0, 2, 0, 4; $im.Cursor = [Windows.Input.Cursors]::Hand; $im.Tag = "$base$($l.img)"; $im.ToolTip = '눌러서 크게 보기'
      $im.Add_MouseLeftButtonUp({ Start-Process $this.Tag }); [void]$ui.Lines.Children.Add($im)
    }
  }
}
# Pasting a picture (Ctrl+V, Shift+Insert, the right-click menu) holds it above the box, like the page:
# Enter sends it with whatever is typed, ✕ or Esc drops it.
# Shrunk to 800 px on its longest side and saved as JPEG, like the page does.
# A failure shows on the chat's top line and goes to %TEMP%\team-pet.log.
function Pic-Log($m) { try { Add-Content -Path (Join-Path $env:TEMP 'team-pet.log') -Value ("{0:HH:mm:ss} {1}" -f (Get-Date), $m) -Encoding UTF8 } catch { } }
function Warn($m) { $ui.Target.Visibility = 'Visible'; $ui.Target.Foreground = $conv.ConvertFrom('#FFB3AD'); $ui.Target.Text = $m }
function Info($m) { $ui.Target.Visibility = 'Visible'; $ui.Target.Foreground = $conv.ConvertFrom('#CFC7FF'); $ui.Target.Text = $m }
function Pic-Fail($m) { Pic-Log $m; Warn "⚠ 이미지를 보내지 못했습니다 ($m)" }
function Drop-Pic { $S.pend = $null; $ui.PendImg.Source = $null; $ui.Pend.Visibility = 'Collapsed' }
function Hold-Pic {
  try {
    $src = [Windows.Clipboard]::GetImage()
    if (-not $src) { return Pic-Fail '클립보드 이미지를 읽지 못함' }
    $k = [Math]::Min(1.0, 800.0 / [Math]::Max($src.PixelWidth, $src.PixelHeight))
    if ($k -lt 1) { $src = New-Object Windows.Media.Imaging.TransformedBitmap $src, (New-Object Windows.Media.ScaleTransform $k, $k) }
    $src = New-Object Windows.Media.Imaging.FormatConvertedBitmap $src, ([Windows.Media.PixelFormats]::Bgr24), $null, 0
    $enc = New-Object Windows.Media.Imaging.JpegBitmapEncoder; $enc.QualityLevel = 85; $enc.Frames.Add([Windows.Media.Imaging.BitmapFrame]::Create($src))
    $ms = New-Object IO.MemoryStream; $enc.Save($ms)
    $S.pend = 'data:image/jpeg;base64,' + [Convert]::ToBase64String($ms.ToArray())
    $ui.PendImg.Source = $src; $ui.Pend.Visibility = 'Visible'; [void]$ui.Input.Focus()
  } catch { Pic-Fail $_.Exception.Message }
}
$ui.PendX.Add_MouseLeftButtonUp({ Drop-Pic; [void]$ui.Input.Focus() })
# "@이름" of someone on the floor I am talking to turns mint while I type (see Shade above).
# A line longer than the box scrolls inside it, where the shade cannot follow: then none.
function Mark-At {
  $text = $ui.Input.Text; $ui.Shade.Inlines.Clear()
  # "@all" (or @모두, @전체) calls the whole floor.
  $names = @('all', '모두', '전체') + @($S.members.Values | Where-Object { $_.who -and $_.floor -eq (To) } | ForEach-Object { $_.name; ($_.name -split '[\s(]')[0] } | Where-Object { $_ } | ForEach-Object { $_.ToLower() })
  $any = $false
  foreach ($part in [regex]::Split($text, '(@[^\s@]{1,20})')) {
    if (-not $part) { continue }
    $r = New-Object Windows.Documents.Run $part
    $who = if ($part.StartsWith('@')) { $part.Substring(1).ToLower() } else { $null }
    if ($who -and @($names | Where-Object { $who.StartsWith($_) }).Count) {
      # Same weight as the box's letters, or the rest of the line would no longer sit on them.
      $any = $true; $r.Foreground = $conv.ConvertFrom('#9FE6CF'); $r.Background = $ui.Input.Background
    } else { $r.Foreground = [Windows.Media.Brushes]::Transparent }
    $ui.Shade.Inlines.Add($r)
  }
  $fits = $ui.Input.ExtentWidth -le $ui.Input.ViewportWidth + 1
  $ui.Shade.Visibility = if ($any -and $fits) { 'Visible' } else { 'Collapsed' }
}
$ui.Input.Add_TextChanged({ Mark-At })
# The text box's own Paste command, not the V key: with the Korean IME on, the key can arrive
# in a form a key check misses, and the menu and Shift+Insert never press V at all.
# A text box cannot paste a picture, so the command is disabled then: allow it for pictures.
# A script block cast to a delegate runs without this script's variables ($S, $ui): close over them.
[Windows.Input.CommandManager]::AddPreviewCanExecuteHandler($ui.Input, [Windows.Input.CanExecuteRoutedEventHandler]{ param($src, $e)
  if ($e.Command -eq [Windows.Input.ApplicationCommands]::Paste -and [Windows.Clipboard]::ContainsImage()) { $e.CanExecute = $true; $e.Handled = $true } })
[Windows.Input.CommandManager]::AddPreviewExecutedHandler($ui.Input, [Windows.Input.ExecutedRoutedEventHandler]({ param($src, $e)
  if ($e.Command -eq [Windows.Input.ApplicationCommands]::Paste -and [Windows.Clipboard]::ContainsImage()) { $e.Handled = $true; Hold-Pic } }.GetNewClosure()))
$ui.Input.Add_PreviewKeyDown({ param($src, $e)
  $k = if ($e.Key -eq 'ImeProcessed') { $e.ImeProcessedKey } else { $e.Key }
  if ($k -eq 'Escape') { if ($S.pend) { Drop-Pic } else { Toggle-Chat $false } }
  if ($k -eq 'Return') { [void]$w.Dispatcher.BeginInvoke([Windows.Threading.DispatcherPriority]::Background, [Action]{ Send-Line }) } })

# ⚔️ 대결 (server/duel.js decides everything): an invite pops up over my pet and the game
# is played right here. The quick draw counts my reaction from the moment "쏴!" shows on
# my own screen; the hub said when that is (goIn), the same moment for both of us.
$S.duelSig = ''; $S.drawId = $null; $S.fired = $false; $S.gunFlip = 1
function Duel-Do($body) {
  $b = @{ floor = $(if ($S.duel) { $S.duel.floor } else { (To) }) }
  foreach ($k in $body.Keys) { $b[$k] = $body[$k] }
  $r = Ask '/api/duel' $b
  if ($r.error) { $ui.Duel.Visibility = 'Visible'; $ui.DuelText.Text = "⚠ $($r.error)"; $S.duelSig = '' } else { Show-Duel $r.duel }
}
function Duel-Button($text, $body, $hot = $false) {
  $b = New-Object Windows.Controls.Button; $b.Content = $text; $b.Tag = $body
  $b.Margin = New-Object Windows.Thickness 3; $b.Padding = New-Object Windows.Thickness 10, 4, 10, 4; $b.BorderThickness = 0
  $b.FontFamily = New-Object Windows.Media.FontFamily 'Malgun Gothic'; $b.FontSize = 13; $b.Cursor = [Windows.Input.Cursors]::Hand
  $b.Background = $conv.ConvertFrom($(if ($hot) { '#F59E0B' } else { '#3B355A' })); $b.Foreground = [Windows.Media.Brushes]::White
  $b.Add_Click({ param($src) if ($src.Tag -is [scriptblock]) { & $src.Tag } else { Duel-Do $src.Tag } })
  [void]$ui.DuelButtons.Children.Add($b)
}
function Stage-Text($text, $size = 14, $color = '#F1EEFC') {
  $t = New-Object Windows.Controls.TextBlock; $t.Text = $text; $t.FontSize = $size; $t.Foreground = $conv.ConvertFrom($color)
  $t.FontFamily = New-Object Windows.Media.FontFamily 'Malgun Gothic'; $t.VerticalAlignment = 'Center'; $t.Margin = New-Object Windows.Thickness 4, 0, 4, 0
  [void]$ui.DuelStage.Children.Add($t); $t
}
# "쏴!": shown at the moment the hub picked; my reaction is timed from here.
function Fire-Draw {
  if (-not $S.duel -or $S.duel.id -ne $S.drawId -or $S.duel.shot) { return }
  $S.fired = $true; $S.watch = [Diagnostics.Stopwatch]::StartNew()
  $ui.DuelText.Text = '🔫 쏴!!!'; $ui.DuelText.FontSize = 26; $ui.DuelText.Foreground = $conv.ConvertFrom('#FF6B6B')
}
function Shoot {
  $move = if ($S.fired) { @{ ms = [int]$S.watch.ElapsedMilliseconds } } else { @{ early = $true } }
  Duel-Do @{ op = 'move'; id = $S.duel.id; move = $move }
}
function Show-Duel($v) {
  if (-not $v) { $ui.Duel.Visibility = 'Collapsed'; $S.duel = $null; $S.duelSig = ''; return }
  $first = $ui.Duel.Visibility -ne 'Visible'
  $S.duel = $v
  $sig = "$($v.id)|$($v.phase)|$($v.pos)|$($v.myTurn)|$(@($v.score) -join ':')|$($v.picked)|$($v.foePicked)|$($v.result)|$(@($v.rounds).Count)|$($v.shot)|$($v.passes)"
  if ($sig -eq $S.duelSig) { return }; $S.duelSig = $sig
  $ui.Duel.Visibility = 'Visible'; if ($first) { Pop $ui.Duel 0 10 }
  $ui.DuelTitle.Text = "⚔️ $($v.title) · $($v.foe.name) 님과"
  $ui.DuelStage.Children.Clear(); $ui.DuelButtons.Children.Clear()
  $ui.DuelText.FontSize = 14; $ui.DuelText.Foreground = [Windows.Media.Brushes]::White
  $id = $v.id; $foe = $v.foe.name
  if ($v.phase -eq 'invite') {
    if ($v.invited) {
      $ui.DuelText.Text = "$foe 님이 대결을 신청했어요!"
      Duel-Button '수락' @{ op = 'accept'; id = $id } $true; Duel-Button '거절' @{ op = 'decline'; id = $id }
    } else { $ui.DuelText.Text = "$foe 님의 대답을 기다리는 중…"; Duel-Button '취소' @{ op = 'leave'; id = $id } }
    return
  }
  if ($v.phase -ne 'play' -and $v.phase -ne 'done') {
    $ui.DuelText.Text = $(if ($v.phase -eq 'declined') { if ($v.invited) { '거절했어요' } else { "$foe 님이 거절했어요" } } else { '대결이 취소됐어요' })
    Duel-Button '닫기' @{ op = 'leave'; id = $id }; return
  }
  if ($v.game -eq 'quickdraw') {
    [void](Stage-Text $foe 12); [void](Stage-Text '🤠    🤠' 22); [void](Stage-Text '나' 12)
    if ($v.phase -eq 'play') {
      if ($v.shot) { $ui.DuelText.Text = '쐈어요! 결과를 기다리는 중…' }
      else {
        if ($S.drawId -ne $id) { $S.drawId = $id; $S.fired = $false; After ([Math]::Max(0, [int]$v.goIn)) { Fire-Draw } $null }
        if ($S.fired) { Fire-Draw } else { $ui.DuelText.Text = '준비… "쏴!" 가 뜨면 바로 누르세요 (먼저 누르면 반칙패)' }
        Duel-Button '🔫 쏘기' { Shoot } $true
      }
    }
  }
  if ($v.game -eq 'roulette') {
    # The gun turns its muzzle to whoever pulls next: the other one on the left, me on the right.
    [void](Stage-Text $foe 12)
    $gun = Stage-Text '🔫' 26; $to = $(if ($v.myTurn) { -1 } else { 1 }); $sc = New-Object Windows.Media.ScaleTransform $S.gunFlip, 1
    $gun.RenderTransformOrigin = New-Object Windows.Point 0.5, 0.5; $gun.RenderTransform = $sc
    Anim $sc ([Windows.Media.ScaleTransform]::ScaleXProperty) $S.gunFlip $to 350 0 $null; $S.gunFlip = $to
    [void](Stage-Text '나' 12)
    $cyl = (0..($v.chambers - 1) | ForEach-Object { if ($v.phase -eq 'done' -and $_ -eq $v.bullet) { '💥' } elseif ($_ -lt $v.pos) { '○' } elseif ($_ -eq $v.pos) { '◉' } else { '●' } }) -join ' '
    if ($v.phase -eq 'play') {
      if ($v.myTurn) {
        $ui.DuelText.Text = "$cyl`n내 차례! 방아쇠를 당길까요?"
        Duel-Button '🔫 당기기' @{ op = 'move'; id = $id; move = 'pull' } $true
        if ($v.passes -gt 0) { Duel-Button "넘기기 ($($v.passes))" @{ op = 'move'; id = $id; move = 'pass' } }
      } else { $ui.DuelText.Text = "$cyl`n$foe 님 차례… 두근두근" }
    } else { $ui.DuelText.Text = $cyl }
  }
  if ($v.game -eq 'rps') {
    [void](Stage-Text "나 $(@($v.score)[0]) : $(@($v.score)[1]) $foe" 16 '#FCD34D')
    $last = @($v.rounds) | Select-Object -Last 1
    $said = if ($last) { "나 $($last.me) vs $($last.foe) $foe → $(@{ me = '이겼어요'; foe = '졌어요'; draw = '비겼어요' }[$last.win])`n" } else { '' }
    if ($v.phase -eq 'play') {
      if ($v.picked) { $ui.DuelText.Text = "$said$foe 님이 낼 때까지 기다리는 중…" }
      else {
        $ui.DuelText.Text = "${said}세 판 중 두 판 먼저! 하나 고르세요"
        Duel-Button '✊' @{ op = 'move'; id = $id; move = 'r' }; Duel-Button '✋' @{ op = 'move'; id = $id; move = 'p' }; Duel-Button '✌️' @{ op = 'move'; id = $id; move = 's' }
      }
    } else { $ui.DuelText.Text = $said.TrimEnd() }
  }
  if ($v.phase -eq 'done') {
    $res = @{ win = @('🏆 이겼어요!', '#FCD34D'); lose = @('😵 졌어요…', '#FF8A8A'); draw = @('🤝 비겼어요', '#C4B5FD') }[$v.result]
    $ui.DuelText.Text = "$($ui.DuelText.Text)`n$($res[0])`n$($v.how)".Trim(); $ui.DuelText.Foreground = $conv.ConvertFrom($res[1])
    if ($v.result -eq 'lose') { Flinch }
    Duel-Button '닫기' @{ op = 'leave'; id = $id }
  }
}

# 🎨 이어 그리기 (server/relay.js keeps the turns and the time). My turn to draw: the picture
# so far lies under a sheet I draw on in my colour, and each line goes to the hub as I lift
# the pen. The last one types the answer. At the end the picture draws itself again, line by line.
$S.relaySig = ''; $S.relayHidden = $null; $S.relayEnds = $null; $S.relayTitle = ''
function Relay-Do($body) {
  $b = @{ floor = $(if ($S.relay) { $S.relay.floor } else { (To) }) }
  foreach ($k in $body.Keys) { $b[$k] = $body[$k] }
  $r = Ask '/api/relay' $b
  if ($r.error) { $ui.Relay.Visibility = 'Visible'; $ui.RelayText.Text = "⚠ $($r.error)"; $S.relaySig = '' }
  elseif ($body.op -ne 'stroke') { $S.relayHidden = $null; Show-Relay $r.relay }
}
function Relay-Button($text, $body, $hot = $false) {
  $b = New-Object Windows.Controls.Button; $b.Content = $text; $b.Tag = $body
  $b.Margin = New-Object Windows.Thickness 3; $b.Padding = New-Object Windows.Thickness 10, 4, 10, 4; $b.BorderThickness = 0
  $b.FontFamily = New-Object Windows.Media.FontFamily 'Malgun Gothic'; $b.FontSize = 13; $b.Cursor = [Windows.Input.Cursors]::Hand
  $b.Background = $conv.ConvertFrom($(if ($hot) { '#2A9D8F' } else { '#3B355A' })); $b.Foreground = [Windows.Media.Brushes]::White
  $b.Add_Click({ param($src) if ($src.Tag -is [scriptblock]) { & $src.Tag } else { Relay-Do $src.Tag } })
  [void]$ui.RelayButtons.Children.Add($b)
}
# Stopping a game stops it for everyone at the table, so it takes a second press within 3 s.
# The asking lives in $S.stopSure, not on the button: the panel is drawn again with each new
# line or guess, and that must not undo it.
$S.stopSure = [datetime]::MinValue
function Stop-Look($b) {
  $sure = (Get-Date) -lt $S.stopSure
  $b.Content = if ($sure) { '끝낼까요? ✕' } else { '✕' }
  $b.Background = $conv.ConvertFrom($(if ($sure) { '#C0392B' } else { '#3B355A' }))
}
function Stop-Button($panel, $send) {
  $b = New-Object Windows.Controls.Button; $b.Tag = $send; $b.ToolTip = '그만하기 — 모두에게서 끝나요'
  $b.Margin = New-Object Windows.Thickness 3; $b.Padding = New-Object Windows.Thickness 6, 2, 6, 2; $b.BorderThickness = 0
  $b.FontFamily = New-Object Windows.Media.FontFamily 'Malgun Gothic'; $b.FontSize = 11; $b.Cursor = [Windows.Input.Cursors]::Hand
  $b.Foreground = [Windows.Media.Brushes]::White; Stop-Look $b
  $b.Add_Click({ param($src)
    if ((Get-Date) -lt $S.stopSure) { $S.stopSure = [datetime]::MinValue; & $src.Tag; return }
    $S.stopSure = (Get-Date).AddSeconds(3); Stop-Look $src
    After 3050 { param($x) Stop-Look $x } $src
  })
  $panel.Content = $b
}
# A line on the 220 px sheet from the hub's 0..1000 square.
function Draw-Line($points, $color, $w) {
  $pl = New-Object Windows.Shapes.Polyline; $pl.Stroke = $conv.ConvertFrom($color); $pl.StrokeThickness = $w
  $pl.StrokeLineJoin = 'Round'; $pl.StrokeStartLineCap = 'Round'; $pl.StrokeEndLineCap = 'Round'
  $pc = New-Object Windows.Media.PointCollection
  foreach ($p in $points) { $pc.Add((New-Object Windows.Point ([double]$p[0] * 0.22), ([double]$p[1] * 0.22))) }
  $pl.Points = $pc; [void]$ui.RelayPast.Children.Add($pl)
}
function Hide-Relay { $S.relayHidden = $S.relay.id; $ui.Relay.Visibility = 'Collapsed' }
function Show-Relay($v) {
  if (-not $v -or $v.id -eq $S.relayHidden) { $ui.Relay.Visibility = 'Collapsed'; $S.relay = $null; $S.relaySig = ''; return }
  $S.relay = $v
  $S.relayEnds = if ($v.timeLeft) { (Get-Date).AddMilliseconds([double]$v.timeLeft) } else { $null }
  if ($v.mode -eq 'catch') { Show-Catch $v; return }
  $sig = "$($v.id)|$($v.phase)|$($v.round)|$($v.turn)|$($v.joined)|$(@($v.players).Count)|$($v.myTurn)"
  if ($sig -eq $S.relaySig) { return }; $S.relaySig = $sig
  $nth = $(if ($v.rounds) { " · $($v.round)/$($v.rounds)문제" } else { '' })
  if ($ui.Relay.Visibility -ne 'Visible') { $ui.Relay.Visibility = 'Visible'; Pop $ui.Relay 0 10 }
  $ui.RelaySheet.Visibility = 'Collapsed'; $ui.RelayGuess.Visibility = 'Collapsed'; $ui.RelayButtons.Children.Clear(); $ui.RelayStop.Content = $null
  $ui.RelayInk.Strokes.Clear(); $ui.RelayInk.IsEnabled = $false; $ui.RelayPast.Children.Clear()
  $players = @($v.players); $names = ($players | ForEach-Object { $_.name }) -join ', '
  if ($v.phase -eq 'lobby') {
    $S.relayTitle = "🎨 이어 그리기 · $($v.floor) 층 · $($players.Count)명"
    $ui.RelayText.Text = "참가: $names`n주제는 첫 사람만 알고, 다음 사람은 그림만 보고 이어서 그려요. 마지막 사람이 맞혀요!"
    if (-not $v.joined) { Relay-Button '참가' @{ op = 'join' } $true; Relay-Button '숨기기' { Hide-Relay } }
    elseif ($v.host) { Relay-Button '시작' @{ op = 'start' } $true; Relay-Button '닫기' @{ op = 'leave' } }
    else { Relay-Button '나가기' @{ op = 'leave' } }
  } elseif ($v.phase -in 'done', 'reveal') {
    $said = "주제: $($v.topic)`n답: $(if ($v.answer) { $v.answer } else { '(답 없음)' })  $(if ($v.correct) { '🎉 맞혔어요!' } else { '😂 아쉬워요!' })"
    if ($v.phase -eq 'reveal') { $S.relayTitle = "🎨 이어 그리기$nth 결과"; $ui.RelayText.Text = "$said`n잠시 뒤 다음 문제! (그리는 순서가 바뀌어요)" }
    elseif ($v.stoppedBy) { $S.relayTitle = '🎨 이어 그리기 결과'; $ui.RelayText.Text = "🛑 $($v.stoppedBy) 님이 그만했어요`n주제: $($v.topic)" }
    else {
      $res = @($v.results); $S.relayTitle = "🎨 이어 그리기 결과 · $($res.Count)문제 중 $($v.score)개"
      $k = 0; $ui.RelayText.Text = (@($res | ForEach-Object { $k++; "$k. $($_.topic) $(if ($_.correct) { '⭕' } else { "❌ → $(if ($_.answer) { $_.answer } else { '…' })" })" }) -join "`n")
    }
    $ui.RelaySheet.Visibility = 'Visible'
    # The picture draws itself again, in the order and colours it was drawn.
    $i = 0
    foreach ($line in @($v.strokes)) { After (300 + $i * 90) { param($l) Draw-Line $l.points $l.color $l.w } @{ points = $line.points; w = $line.w; color = $players[$line.by].color }; $i++ }
    if ($v.phase -eq 'done') { Relay-Button '닫기' { Hide-Relay } } elseif ($v.joined) { Stop-Button $ui.RelayStop { Relay-Do @{ op = 'leave' } } }
  } else {
    $cur = $players[$v.turn].name
    $S.relayTitle = "🎨 이어 그리기$nth · $($v.turn + 1)/$($players.Count)번째"
    if ($v.myTurn) {
      $ui.RelaySheet.Visibility = 'Visible'
      foreach ($line in @($v.strokes)) { Draw-Line $line.points $players[$line.by].color $line.w }
      if ($v.phase -eq 'draw') {
        $ui.RelayInk.IsEnabled = $true
        $da = $ui.RelayInk.DefaultDrawingAttributes; $da.Color = [Windows.Media.ColorConverter]::ConvertFromString($players[$v.me].color); $da.Width = 5; $da.Height = 5; $da.FitToCurve = $true
        $ui.RelayText.Text = $(if ($v.role -eq 'first') { "주제: 「$($v.topic)」`n그려 주세요! (글자는 안 돼요)" } else { '앞 사람 그림에 이어서 그려요 (주제는 비밀!)' })
        Relay-Button '다 그렸어요' @{ op = 'pass' } $true
        $w.Activate()
      } else {
        $ui.RelayText.Text = '이 그림은 뭘까요? 정답을 외쳐요!'
        $ui.RelayGuess.Text = ''; $ui.RelayGuess.Visibility = 'Visible'; $w.Activate(); [void]$ui.RelayGuess.Focus()
        Relay-Button '정답!' { Relay-Do @{ op = 'guess'; text = $ui.RelayGuess.Text } } $true
      }
    } else {
      $doing = if ($v.phase -eq 'guess') { '맞히는' } else { '그리는' }
      $ui.RelayText.Text = $(if ($v.joined) { "$cur 님이 $doing 중… 내 차례를 기다려요" } else { "$cur 님이 $doing 중 (구경 중)" })
      if (-not $v.joined) { Relay-Button '숨기기' { Hide-Relay } }
    }
    if ($v.joined) { Stop-Button $ui.RelayStop { Relay-Do @{ op = 'leave' } } }
  }
  $ui.RelayTitle.Text = $S.relayTitle
}
# Each line I draw goes to the hub when I lift the pen (at most 200 points of it).
$ui.RelayInk.Add_StrokeCollected({ param($src, $e)
  if (-not $S.relay -or -not $S.relay.myTurn) { return }
  $sp = $e.Stroke.StylusPoints; $step = [Math]::Max(1, [int][Math]::Ceiling($sp.Count / 200))
  $pts = New-Object Collections.ArrayList
  for ($i = 0; $i -lt $sp.Count; $i += $step) { [void]$pts.Add(@([int]($sp[$i].X / 0.22), [int]($sp[$i].Y / 0.22))) }
  Relay-Do @{ op = 'stroke'; stroke = @{ w = 5; points = $pts.ToArray() } }
})
$ui.RelayGuess.Add_KeyDown({ param($src, $e)
  if ($e.Key -ne 'Return' -or -not $ui.RelayGuess.Text.Trim()) { return }
  Relay-Do @{ op = 'guess'; text = $ui.RelayGuess.Text }
  # 🖍 guesses go on until one is right; the box is ready for the next.
  if ($S.relay.mode -eq 'catch') { $ui.RelayGuess.Text = '' }
})
# 🖍 캐치마인드 in the same panel: the sheet fills in as the drawer lifts the pen, the last
# few guesses and the scores go in the text, and the guess box keeps what I am typing.
$S.catchSheet = ''
# 🖍 one setting before it starts: its name, then small pills; the picked one is coloured.
function Pick-Row($label, $options, $current, $field, $unit) {
  $row = New-Object Windows.Controls.StackPanel; $row.Orientation = 'Horizontal'; $row.Width = 226; $row.Margin = New-Object Windows.Thickness 0, 2, 0, 2
  $t = New-Object Windows.Controls.TextBlock; $t.Text = $label; $t.Width = 54; $t.VerticalAlignment = 'Center'
  $t.FontFamily = New-Object Windows.Media.FontFamily 'Malgun Gothic'; $t.FontSize = 11; $t.Foreground = $conv.ConvertFrom('#9C95C9'); [void]$row.Children.Add($t)
  foreach ($o in $options) {
    $b = New-Object Windows.Controls.Button; $b.Content = "$o$unit"; $b.Tag = @{ op = 'setup'; $field = $o }
    $b.Margin = New-Object Windows.Thickness 2; $b.Padding = New-Object Windows.Thickness 0, 3, 0, 3; $b.Width = 36; $b.BorderThickness = 0
    $b.FontFamily = New-Object Windows.Media.FontFamily 'Malgun Gothic'; $b.FontSize = 12; $b.Cursor = [Windows.Input.Cursors]::Hand
    $b.Background = $conv.ConvertFrom($(if ($o -eq $current) { '#2A9D8F' } else { '#2E2A45' })); $b.Foreground = [Windows.Media.Brushes]::White
    $b.Add_Click({ param($src) Relay-Do $src.Tag })
    [void]$row.Children.Add($b)
  }
  [void]$ui.RelayButtons.Children.Add($row)
}
function Show-Catch($v) {
  $sig = "$($v.id)|$($v.phase)|$($v.round)|$($v.joined)|$(@($v.players).Count)|$($v.myTurn)|$(@($v.strokes).Count)|$(@($v.feed).Count)|$($v.rounds)|$($v.secs)"
  if ($sig -eq $S.relaySig) { return }; $S.relaySig = $sig
  if ($ui.Relay.Visibility -ne 'Visible') { $ui.Relay.Visibility = 'Visible'; Pop $ui.Relay 0 10 }
  $ui.RelayButtons.Children.Clear(); $ui.RelayStop.Content = $null
  $players = @($v.players)
  $score = if ($v.scores) { '점수: ' + ((0..($players.Count - 1) | ForEach-Object { "$($players[$_].name) $(@($v.scores)[$_])" }) -join ' · ') } else { '' }
  $ui.RelaySheet.Visibility = if ($v.phase -eq 'lobby') { 'Collapsed' } else { 'Visible' }
  $guessing = $v.phase -eq 'draw' -and $v.role -eq 'guesser'
  if (-not $guessing) { $ui.RelayGuess.Visibility = 'Collapsed' }
  elseif ($ui.RelayGuess.Visibility -ne 'Visible') { $ui.RelayGuess.Text = ''; $ui.RelayGuess.Visibility = 'Visible'; $w.Activate(); [void]$ui.RelayGuess.Focus() }
  # The drawer's own lines are on the ink already; the sheet is redrawn for a new turn, and
  # for the others whenever a line comes in.
  $key = "$($v.id)|$($v.round)|$(if ($v.myTurn) { 'mine' } else { @($v.strokes).Count })"
  if ($key -ne $S.catchSheet) {
    $S.catchSheet = $key; $ui.RelayPast.Children.Clear(); $ui.RelayInk.Strokes.Clear()
    foreach ($line in @($v.strokes)) { Draw-Line $line.points $players[$line.by].color $line.w }
  }
  $ui.RelayInk.IsEnabled = [bool]$v.myTurn
  if ($v.myTurn) { $da = $ui.RelayInk.DefaultDrawingAttributes; $da.Color = [Windows.Media.ColorConverter]::ConvertFromString($players[$v.me].color); $da.Width = 5; $da.Height = 5; $da.FitToCurve = $true }
  $feed = (@($v.feed) | Select-Object -Last 3 | ForEach-Object { if ($_.ok) { "✅ $($_.by) 님 정답!" } else { "$($_.by): $($_.text)" } }) -join "`n"
  if ($v.phase -eq 'lobby') {
    $S.relayTitle = "🖍 캐치마인드 · $($v.floor) 층 · $($players.Count)명"
    $ui.RelayText.Text = "참가: $(($players | ForEach-Object { $_.name }) -join ', ')`n한 사람이 그리고 나머지가 맞혀요. 맞힌 사람이 다음에 그려요!`n$($v.rounds)문제 · 한 문제 $($v.secs)초$(if (-not $v.host) { ' (연 사람이 정해요)' })"
    if (-not $v.joined) { Relay-Button '참가' @{ op = 'join' } $true; Relay-Button '숨기기' { Hide-Relay } }
    elseif ($v.host) {
      Pick-Row '문제 수' @($v.roundOptions) $v.rounds 'rounds' ''
      Pick-Row '시간(초)' @($v.secOptions) $v.secs 'secs' ''
      Relay-Button '▶ 시작' @{ op = 'start' } $true; Relay-Button '닫기' @{ op = 'leave' }
    }
    else { Relay-Button '나가기' @{ op = 'leave' } }
  } elseif ($v.phase -eq 'done') {
    $S.relayTitle = '🖍 캐치마인드 결과'; $ui.RelaySheet.Visibility = 'Collapsed'
    $head = if ($v.stoppedBy) { "🛑 $($v.stoppedBy) 님이 그만했어요" } elseif (@($v.winners).Count) { "🏆 $(@($v.winners) -join ', ') 님 1등!" } else { '아무도 못 맞혔어요 😂' }
    $ui.RelayText.Text = "$head`n$score"
    Relay-Button '닫기' { Hide-Relay }
  } else {
    $S.relayTitle = "🖍 캐치마인드 · $($v.round)/$($v.rounds)문제$(if ($v.hard) { ' · 🔥 어려운 문제 (2점)' })"
    if ($v.phase -eq 'reveal') {
      $l = $v.last
      $ui.RelayText.Text = $(if ($l.by) { "✅ $($l.by) 님 정답!$(if ($l.hard) { ' (🔥 +2점)' }) 「$($l.topic)」`n다음은 $($l.by) 님이 그려요" } else { "⏰ 아무도 못 맞혔어요 — 정답은 「$($l.topic)」" }) + "`n$score"
    } elseif ($v.myTurn) {
      $ui.RelayText.Text = "내 차례! 「$($v.topic)」 을(를) 그려요$(if ($feed) { "`n$feed" })"
      Relay-Button '🧽 지우기' { $ui.RelayPast.Children.Clear(); $ui.RelayInk.Strokes.Clear(); Relay-Do @{ op = 'clear' } }
      Relay-Button '넘기기' @{ op = 'pass' }
      $w.Activate()
    } else {
      $ui.RelayText.Text = "$($v.drawer) 님이 그리는 중 · $($v.mask)$(if ($feed) { "`n$feed" })"
      if (-not $v.joined) { Relay-Button '숨기기' { Hide-Relay } }
    }
    if ($v.joined) { Stop-Button $ui.RelayStop { Relay-Do @{ op = 'leave' } } }
  }
  $ui.RelayTitle.Text = $S.relayTitle
}

# 🎲 같이 하기 (server/party.js decides). The tower's sliding block moves here by the hub's
# own rule (where it started, how fast), so where I let go is where it lands.
$S.partySig = ''; $S.partyHidden = $null; $S.partyTitle = ''; $S.slider = $null; $S.towerFall = $null; $S.towerKey = ''; $S.barTop = $null
$S.partyClock = [Diagnostics.Stopwatch]::StartNew(); $S.slideClock = [Diagnostics.Stopwatch]::StartNew(); $S.slideKey = ''; $S.slideBase = 0
function Party-Do($body) {
  $b = @{ floor = $(if ($S.party) { $S.party.floor } else { (To) }) }
  foreach ($k in $body.Keys) { $b[$k] = $body[$k] }
  $r = Ask '/api/party' $b
  if ($r.error) { $ui.Party.Visibility = 'Visible'; $ui.PartyText.Text = "⚠ $($r.error)"; $S.partySig = ''; $S.partyErr = $r.error; $S.partyErrAt = Get-Date; if ($S.party -and $S.party.kind -eq 'subway') { Subway-Shake } }
  else { if ($body.op -ne 'state') { $S.partyHidden = $null }; Show-Party $r.party }
}
function Party-Button($text, $body, $hot = $false, $off = $false) {
  $b = New-Object Windows.Controls.Button; $b.Content = $text; $b.Tag = $body; $b.IsEnabled = -not $off
  $b.Margin = New-Object Windows.Thickness 3; $b.Padding = New-Object Windows.Thickness 10, 4, 10, 4; $b.BorderThickness = 0
  $b.FontFamily = New-Object Windows.Media.FontFamily 'Malgun Gothic'; $b.FontSize = 13; $b.Cursor = [Windows.Input.Cursors]::Hand
  $b.Background = $conv.ConvertFrom($(if ($hot) { '#7C6CF0' } else { '#3B355A' })); $b.Foreground = [Windows.Media.Brushes]::White
  $b.Add_Click({ param($src) if ($src.Tag -is [scriptblock]) { & $src.Tag } else { Party-Do $src.Tag } })
  [void]$ui.PartyButtons.Children.Add($b)
}
function Hide-Party { $S.partyHidden = $S.party.id; $ui.Party.Visibility = 'Collapsed' }
# 🏗 back and forth over the 1000-wide floor, as on the hub.
# ($sl, not $s: PowerShell names ignore case, and a local $s hid the global $S — the slide's clock then
# read as 0 and the bar stood still at the left, every drop landing there.)
function Slide-X {
  $sl = $S.party.slide; $span = 1000 - $sl.w
  $d = ((($S.slideBase + $S.slideClock.ElapsedMilliseconds) / 1000) * $sl.speed) % (2 * $span)
  if ($d -le $span) { $d } else { 2 * $span - $d }
}
function Brick($x, $w, $row, $level, $alpha = 1) {
  $r = New-Object Windows.Shapes.Rectangle; $r.Width = [Math]::Max(1, $w * 0.22); $r.Height = 13; $r.RadiusX = 2; $r.RadiusY = 2; $r.Opacity = $alpha
  $r.Fill = New-Object Windows.Media.SolidColorBrush ([Windows.Media.Color]::FromRgb([byte](120 + ($level * 53) % 120), [byte](140 + ($level * 31) % 100), [byte](200 - ($level * 41) % 120)))
  [Windows.Controls.Canvas]::SetLeft($r, $x * 0.22); [Windows.Controls.Canvas]::SetTop($r, 240 - 6 - ($row + 1) * 15); [void]$ui.PartyStack.Children.Add($r); $r
}
function Draw-Tower {
  $p = $S.party; $ui.PartyStack.Children.Clear(); $S.slider = $null; $S.towerFall = $null
  $blocks = @($p.blocks); $shown = $blocks | Select-Object -Last 13; $skip = $blocks.Count - @($shown).Count
  $i = 0; $topEl = $null; foreach ($b in $shown) { $topEl = Brick $b.x $b.w $i ($skip + $i); $i++ }
  if ($p.phase -eq 'play') { $S.slider = Brick (Slide-X) $p.slide.w ($i + 1) ($skip + $i) $(if ($p.myTurn) { 1 } else { 0.55 }) }
  # A block just dropped (on this game, since the last drawing) falls from where the bar was drawn:
  # onto the stack, the overhang then cut off and tumbling away; or, missing, past it.
  $key = "$($p.id)|$($blocks.Count)|$($p.phase)"; $was = $S.towerKey; $wasTop = $S.barTop; $S.towerKey = $key
  $S.barTop = 240 - 6 - ($i + 2) * 15
  if ($was -and $was -ne $key -and $was.StartsWith("$($p.id)|") -and $p.last -and $null -ne $wasTop) {
    $fe = Brick $p.last.x $p.last.w 0 ($skip + $i); [Windows.Controls.Canvas]::SetTop($fe, $wasTop)
    $tf = @{ el = $fe; y0 = [double]$wasTop; clock = [Diagnostics.Stopwatch]::StartNew(); landed = $false; level = $skip + $i }
    if ($blocks.Count -gt [int]($was.Split('|')[1]) -and $topEl) {
      $topEl.Visibility = 'Hidden'; $tf.top = $topEl; $tf.y1 = [Windows.Controls.Canvas]::GetTop($topEl)
      $nb2 = $blocks[-1]; $lx = [double]$p.last.x; $lw = [double]$p.last.w
      if ($lx -lt $nb2.x) { $tf.cut = @($lx, ($nb2.x - $lx), -1) }
      elseif ($lx + $lw -gt $nb2.x + $nb2.w) { $tf.cut = @(($nb2.x + $nb2.w), ($lx + $lw - $nb2.x - $nb2.w), 1) }
    } else { $tf.y1 = 252.0; $tf.miss = $true }
    $tf.dur = [Math]::Max(0.09, [Math]::Sqrt(2 * [Math]::Max(1.0, $tf.y1 - $tf.y0) / 1400))
    if ($S.slider) { $S.slider.Visibility = 'Hidden' }
    $S.towerFall = $tf
  }
}
# The fall, frame by frame: down faster and faster; landed, the stack's new top shows (a little
# squash) and the cut piece tumbles off, sideways and down, fading.
function Tower-Fall {
  $tf = $S.towerFall; $te = $tf.clock.Elapsed.TotalSeconds
  if (-not $tf.landed) {
    $q = [Math]::Min(1.0, $te / $tf.dur); [Windows.Controls.Canvas]::SetTop($tf.el, $tf.y0 + ($tf.y1 - $tf.y0) * $q * $q)
    if ($tf.miss) { $tf.el.Opacity = [Math]::Max(0.0, 1.0 - [Math]::Max(0.0, $q - 0.6) / 0.4) }
    if ($q -lt 1) { return }
    $tf.landed = $true; $tf.t1 = $te
    if ($tf.miss) { [void]$ui.PartyStack.Children.Remove($tf.el); $S.towerFall = $null; return }
    [void]$ui.PartyStack.Children.Remove($tf.el); $tf.top.Visibility = 'Visible'
    $tf.top.RenderTransformOrigin = New-Object Windows.Point 0.5, 1; $tf.squash = New-Object Windows.Media.ScaleTransform 1, 0.7; $tf.top.RenderTransform = $tf.squash
    if ($tf.cut) { $tf.piece = Brick $tf.cut[0] $tf.cut[1] 0 $tf.level; [Windows.Controls.Canvas]::SetTop($tf.piece, $tf.y1)
      $tf.piece.RenderTransformOrigin = New-Object Windows.Point 0.5, 0.5; $tf.spin = New-Object Windows.Media.RotateTransform 0; $tf.piece.RenderTransform = $tf.spin }
    if ($S.slider) { $S.slider.Visibility = 'Visible' }
    return
  }
  $k = $te - $tf.t1
  $tf.squash.ScaleY = [Math]::Min(1.0, 0.7 + $k / 0.12 * 0.3)
  if ($tf.piece) {
    [Windows.Controls.Canvas]::SetTop($tf.piece, $tf.y1 + 40 * $k + 700 * $k * $k)
    [Windows.Controls.Canvas]::SetLeft($tf.piece, $tf.cut[0] * 0.22 + $tf.cut[2] * 30 * $k)
    $tf.spin.Angle = $tf.cut[2] * 260 * $k; $tf.piece.Opacity = [Math]::Max(0.0, 1.0 - $k / 0.75)
  }
  if ($k -ge 0.75) { if ($tf.piece) { [void]$ui.PartyStack.Children.Remove($tf.piece) }; $tf.top.RenderTransform = $null; $S.towerFall = $null }
}
function Drop-Block { if ($S.party -and $S.party.myTurn -and $S.party.kind -eq 'stack') { Party-Do @{ op = 'drop'; x = [int](Slide-X) } } }
$ui.PartyTower.Add_MouseLeftButtonDown({ Drop-Block })
# Enter with Hangul still being composed comes as ImeProcessed, and the last syllable lands in
# the box only after this event: so the box is read a moment later.
$ui.PartyWord.Add_KeyDown({ param($src, $e)
  $k = if ($e.Key -eq 'ImeProcessed') { $e.ImeProcessedKey } else { $e.Key }
  if ($k -ne 'Return') { return }
  $e.Handled = $true
  # Read once the IME has put the last syllable down (150 ms), and only once: Enter mid-word can
  # come twice, and the second used to send what the first had not yet seen.
  if ($S.wordWait) { return }
  $S.wordWait = $true
  After 150 { $S.wordWait = $false; Word-Send } $null
})
function Word-Send {
  if (-not $ui.PartyWord.Text.Trim()) { return }
  $t = $ui.PartyWord.Text.Trim(); $ui.PartyWord.Text = ''
  if ($S.party -and $S.party.kind -eq 'subway' -and $S.party.phase -eq 'lobby') {
    $two = @($t -split '\s*(?:→|->|>|,|~|\s)\s*' | Where-Object { $_ })
    if ($two.Count -ne 2) { $ui.PartyText.Text = '⚠ 출발역과 도착역 두 개를 띄어 써요 (예: 합정 고속터미널)'; return }
    Party-Do @{ op = 'route'; from = $two[0]; to = $two[1] }; return
  }
  Party-Do @{ op = 'say'; word = $t }
}
# The slide moves on every frame the screen draws (a timer of its own stutters); the bomb's
# shake and the seconds left on my turn need less.
[Windows.Media.CompositionTarget]::add_Rendering({
  $p = $S.party
  if ($p -and $p.kind -eq 'stack' -and $p.phase -eq 'play' -and $S.slider -and $ui.Party.Visibility -eq 'Visible') { [Windows.Controls.Canvas]::SetLeft($S.slider, (Slide-X) * 0.22) }
  if ($S.towerFall) { try { Tower-Fall } catch { $S.towerFall = $null } }
})
$partyAnim = New-Object Windows.Threading.DispatcherTimer; $partyAnim.Interval = [TimeSpan]::FromMilliseconds(50)
$partyAnim.Add_Tick({
  $p = $S.party; if (-not $p -or $ui.Party.Visibility -ne 'Visible' -or $p.phase -ne 'play') { return }
  if ($p.kind -eq 'bomb') {
    $amp = @(0, 4, 8, 14)[[int]$p.heat]; $speed = @(1, 300, 160, 70)[[int]$p.heat]
    $ui.PartyStage.RenderTransform = New-Object Windows.Media.RotateTransform ([Math]::Sin($S.partyClock.ElapsedMilliseconds / $speed) * $amp)
  }
  if (($p.myTurn -or $p.kind -eq 'liar' -or $p.kind -eq 'fool') -and $null -ne $p.timeLeft) {
    $left = [Math]::Max(0, [int][Math]::Ceiling(($p.timeLeft - $S.partyClock.ElapsedMilliseconds) / 1000))
    $ui.PartyTitle.Text = "$($S.partyTitle) · ⏱ ${left}초"
  }
})
$partyAnim.Start()
function Word-Box($max) { $S.wordOn = $true; $ui.PartyWord.MaxLength = $max; $ui.PartyWord.Text = ''; $ui.PartyWord.Visibility = 'Visible'; $w.Activate(); [void]$ui.PartyWord.Focus() }
# 🕵️ my card (the word, or that I am the liar) and the hints so far, then the vote and the
# caught liar's guess; the word box takes a hint or the guess.
function Show-Liar($v, $cur) {
  $done = $v.phase -eq 'done'; $players = @($v.players)
  if ($v.step -eq 'topic' -and -not $done) {
    $ui.PartyStage.Text = "어떤 주제로 할까요?`n(표가 가장 많은 주제에서 제시어가 나와요)"
    $ui.PartyText.Text = "주제 투표 $($v.voted)/$($players.Count)$(if ($v.myTopic) { " · 내 표: $($v.myTopic)" })"
    if ($v.joined) { foreach ($t in @($v.topics)) { Party-Button "$($t.name)$(if ($t.votes) { " $($t.votes)" })" @{ op = 'topic'; category = $t.name } ($v.myTopic -eq $t.name) } }
    return
  }
  if ($done -and -not $v.word) { $ui.PartyText.Text = $v.how; return }
  $card = if (-not $v.joined) { '구경 중 — 제시어는 참가한 사람만 봐요' }
    elseif ($v.iAmLiar -and -not $done) { "카테고리: $($v.category)`n🕵️ 당신은 라이어입니다" }
    else { "카테고리: $($v.category)`n제시어: $($v.word)$(if ($done -and $v.decoy) { "`n(라이어가 받은 말: $($v.decoy))" })" }
  $hints = (@($v.hints) | Select-Object -Last 8 | ForEach-Object { "$($_.by): $(if ($_.text) { $_.text } else { '(시간 초과)' })" }) -join "`n"
  $ui.PartyStage.Text = $(if ($hints) { "$card`n─────`n$hints" } else { $card })
  if ($done) {
    $tally = if ($v.tally) { "`n표: $((0..($players.Count - 1) | ForEach-Object { "$($players[$_]) $(@($v.tally)[$_])" }) -join ' · ')" } else { '' }
    $ui.PartyText.Text = "$($v.how)`n라이어는 $($v.liar) 님이었어요$tally"
  } elseif ($v.step -eq 'hint') {
    $round = "$($v.round)/$($v.rounds)바퀴"
    if ($v.myTurn) { $ui.PartyText.Text = "내 차례! 제시어를 한 줄로 설명해요 (${round}, Enter)"; Word-Box 30 }
    else { $ui.PartyText.Text = "$cur 님이 설명하는 중 · $round" }
  } elseif ($v.step -eq 'vote') {
    $ui.PartyText.Text = "라이어는 누구? 층 대화로 의논해도 돼요 · 투표 $($v.voted)/$($players.Count)"
    if ($v.joined) { for ($i = 0; $i -lt $players.Count; $i++) { if ($i -ne $v.me) { Party-Button "$(if ($v.myVote -eq $i) { '✔ ' })🗳 $($players[$i])" @{ op = 'vote'; to = $i } ($v.myVote -eq $i) } } }
  } elseif ($v.step -eq 'guess') {
    if ($v.myTurn) { $ui.PartyText.Text = '들켰어요! 제시어를 맞히면 역전승 (Enter)'; Word-Box 20 }
    else { $ui.PartyText.Text = "라이어 $cur 님이 잡혔어요! 제시어를 맞히는 중…" }
  }
}
# 🚇 지하철 레이스: the way (from the start, each stop and each change of line), with my place
# on it and the next thing to type big; the box keeps a half-typed name when the board changes.
# Under it the board: arrived by time, the rest by how far along they are.
# The stage as runs: $head, then the way with each stop in its line's colour, a change of line on
# its colour, the ones passed grey and the one to type now bold on yellow; then $tail.
# The way as a map. nodes: the start, then every stop typed (a node's line is the one it is
# reached on); folded into rows of 4, each row back the other way so the line runs on down the side.
$S.subPos = @{}
function Sub-XY($i) {
  $row = [Math]::Floor($i / 4); $col = $i % 4; if ($row % 2) { $col = 3 - $col }
  @{ x = 18 + $col * 61.3; y = 24 + $row * 48 }
}
function Subway-Map($v) {
  $rt = $v.route; $steps = @($rt.steps)
  $nodes = @(@{ name = $rt.from; color = $steps[0].color }) + @($steps | ForEach-Object { @{ name = $_.name; color = $_.color; change = [bool]$_.change } })
  $cv = $ui.PartyStack; $cv.Children.Clear()
  $ui.PartyTower.Height = 24 + [Math]::Ceiling($nodes.Count / 4) * 48 - 12; $ui.PartyTower.Cursor = [Windows.Input.Cursors]::Arrow; $ui.PartyTower.Visibility = 'Visible'
  $put = { param($el, $x, $y) [Windows.Controls.Canvas]::SetLeft($el, $x); [Windows.Controls.Canvas]::SetTop($el, $y); [void]$cv.Children.Add($el) }
  $text = { param($t, $x, $y, $size, $fg, $bold)
    $tb = New-Object Windows.Controls.TextBlock; $tb.Text = $t; $tb.FontFamily = New-Object Windows.Media.FontFamily 'Malgun Gothic'; $tb.FontSize = $size; $tb.Foreground = $conv.ConvertFrom($fg)
    if ($bold) { $tb.FontWeight = 'Bold' }; $tb.Measure((New-Object Windows.Size 200, 50)); & $put $tb ($x - $tb.DesiredSize.Width / 2) $y }
  for ($i = 1; $i -lt $nodes.Count; $i++) {
    $p = Sub-XY ($i - 1); $q = Sub-XY $i
    $ln = New-Object Windows.Shapes.Line; $ln.X1 = $p.x; $ln.Y1 = $p.y; $ln.X2 = $q.x; $ln.Y2 = $q.y; $ln.Stroke = $conv.ConvertFrom($nodes[$i].color); $ln.StrokeThickness = 4; $ln.StrokeStartLineCap = 'Round'; $ln.StrokeEndLineCap = 'Round'
    [void]$cv.Children.Add($ln)
  }
  for ($i = 0; $i -lt $nodes.Count; $i++) {
    $n = $nodes[$i]; $p = Sub-XY $i; $end = $i -eq $nodes.Count - 1; $big = $n.change -or $end -or $i -eq 0
    $r = $(if ($big) { 6 } else { 3.5 })
    $d = New-Object Windows.Shapes.Ellipse; $d.Width = $r * 2; $d.Height = $r * 2; $d.Fill = [Windows.Media.Brushes]::White; $d.Stroke = $conv.ConvertFrom($n.color); $d.StrokeThickness = $(if ($big) { 2.5 } else { 1.8 })
    & $put $d ($p.x - $r) ($p.y - $r)
    if ($n.change) { & $text '🔁' ($p.x + 10) ($p.y - 16) 8 '#FFFFFF' $false }
    if ($end) { & $text '⭐' ($p.x + 10) ($p.y - 16) 9 '#FFD666' $false }
    $nm = $(if ($n.name.Length -gt 5) { $n.name.Substring(0, 4) + '…' } else { $n.name })
    & $text $nm $p.x ($p.y + 6) 8.5 $(if ($end) { '#FFD666' } else { '#D8D4EA' }) ($end -or $i -eq 0)
  }
  # The pets, mine last (on top) and bigger; a few on one station side by side.
  $board = @($v.board); $here = @{}; $mine = $null
  foreach ($e in @($board | Sort-Object { [int][bool]$_.me })) {
    $node = [Math]::Min([int]$e.pos, $nodes.Count - 1); $k = [int]$here[$node]; $here[$node] = $k + 1
    $m = $(if ($e.me) { $S.members[''] } else { $S.members["$($v.floor)|$($e.id)"] })
    $fr = $(if ($m) { $m.frames } else { Frames 'cat' })
    $size = $(if ($e.me) { 20 } else { 16 }); $p = Sub-XY $node
    $img = New-Object Windows.Controls.Image; $img.Source = $fr[0]; $img.Width = $size; $img.Height = $size
    [Windows.Media.RenderOptions]::SetBitmapScalingMode($img, 'NearestNeighbor')
    if ($e.me) { $img.Effect = New-Object Windows.Media.Effects.DropShadowEffect -Property @{ Color = [Windows.Media.Colors]::Gold; BlurRadius = 6; ShadowDepth = 0; Opacity = 1 }; $mine = $img }
    $mv = New-Object Windows.Media.TranslateTransform; $img.RenderTransform = $mv
    $off = $(if ($k) { $(if ($k % 2) { 1 } else { -1 }) * [Math]::Ceiling($k / 2) * 8 } else { 0 })
    & $put $img ($p.x - $size / 2 + $off) ($p.y - $size - 4)
    # Moved since last drawn: slide in from the station it stood on.
    $was = $S.subPos[$e.id]
    if ($null -ne $was -and $was -ne $node) { $o = Sub-XY $was; Anim $mv ([Windows.Media.TranslateTransform]::XProperty) ($o.x - $p.x) 0 260 0 $null; Anim $mv ([Windows.Media.TranslateTransform]::YProperty) ($o.y - $p.y) 0 260 0 $null }
    $S.subPos[$e.id] = $node
    if ($null -ne $e.done) {
      $place = @($board | Where-Object { $null -ne $_.done }).IndexOf($e)
      & $text $(if ($place -ge 0 -and $place -lt 3) { @('🥇', '🥈', '🥉')[$place] } else { '🏁' }) $p.x ($p.y - $size - 16) 9 '#FFFFFF' $false
    }
  }
  $S.subMine = $mine
}
# A wrong name: my pet shakes where it is.
function Subway-Shake {
  if (-not $S.subMine) { return }
  $t = $S.subMine.RenderTransform
  $x = New-Object Windows.Media.Animation.DoubleAnimation; $x.From = -4; $x.To = 4; $x.Duration = New-Object Windows.Duration ([TimeSpan]::FromMilliseconds(50)); $x.AutoReverse = $true; $x.RepeatBehavior = New-Object Windows.Media.Animation.RepeatBehavior 2
  $t.BeginAnimation([Windows.Media.TranslateTransform]::XProperty, $x)
}
function Show-Subway($v) {
  $rt = $v.route; $r = $v.ride; $medal = @('🥇', '🥈', '🥉'); $n = @($rt.steps).Count
  $top = "🚇 $($rt.from) → $($rt.to) · $($n)역$(if ($rt.random) { ' (🎲 무작위)' })"
  if ($r -and $null -ne $r.done) { $ui.PartyStage.Text = "$top`n🏁 도착! $('{0:0.0}' -f ($r.done / 1000))초$(if ($r.miss) { " · 틀림 $($r.miss)번" })" }
  elseif ($r -and $v.phase -eq 'play' -and $v.startsIn -gt 0) { $ui.PartyStage.Text = "$top`n⏳ $([Math]::Ceiling($v.startsIn / 1000))초 뒤 출발! 노선을 미리 봐 두세요"; After ([int]$v.startsIn + 50) { Party-Do @{ op = 'state' } } $null }
  elseif ($r -and $v.phase -eq 'play') { $st = @($rt.steps)[$r.pos]; $ui.PartyStage.Text = "$top`n다음 역 ▶ $($st.name)$(if ($st.change) { " ($($st.line)으로 환승)" })" }
  else { $ui.PartyStage.Text = $top }
  Subway-Map $v
  $i = 0
  $ui.PartyText.Text = $(if ($v.phase -eq 'done') { $v.how } else {
    $(if ($S.partyErr -and ((Get-Date) - $S.partyErrAt).TotalMilliseconds -lt 1500) { "⚠ $($S.partyErr)`n" }) + ((@($v.board) | ForEach-Object { $k = $i++; if ($null -ne $_.done) { "$(if ($k -lt 3) { $medal[$k] } else { "$($k + 1)등" }) $($_.name) $('{0:0.0}' -f ($_.done / 1000))초$(if ($_.me) { ' ◀' })" } else { "🚃 $($_.name) $($_.pos)/$n$(if ($_.me) { ' ◀' })" } }) -join '   ') })
  # The box stays as it is while others move on (hiding it each time lost what I was typing).
  if ($v.myTurn) {
    $S.wordOn = $true; $ui.PartyWord.MaxLength = 14; $ui.PartyWord.Visibility = 'Visible'
    if ($S.subFocus -ne "$($v.id)|play") { $S.subFocus = "$($v.id)|play"; $w.Activate(); [void]$ui.PartyWord.Focus() }
  }
}
function Show-Party($v) {
  if (-not $v -or $v.id -eq $S.partyHidden) { $ui.Party.Visibility = 'Collapsed'; $S.party = $null; $S.partySig = ''; return }
  $S.party = $v; $S.partyClock.Restart()
  # The slide's clock is set once per block: setting it on every poll made it jump by the lag.
  if ($v.slide) { $key = "$($v.id)|$($v.height)|$($v.turn)"; if ($key -ne $S.slideKey) { $S.slideKey = $key; $S.slideBase = $v.slide.elapsed; $S.slideClock.Restart() } }
  # A refusal in the lobby (a station that is not there) stays 4 s: drawn again on the next poll,
  # it used to vanish at once, and the race then started on a random way with no word why.
  $lobbyErr = $(if ($v.phase -eq 'lobby' -and $S.partyErr -and ((Get-Date) - $S.partyErrAt).TotalSeconds -lt 4) { $S.partyErr } else { '' })
  $sig = "$lobbyErr|$($v.id)|$($v.phase)|$($v.turn)|$($v.joined)|$(@($v.players).Count)|$($v.myTurn)|$($v.height)|$($v.throws)|$(@($v.words).Count)|$($v.canToss)|$($v.heat)|$($v.step)|$(@($v.hints).Count)|$($v.voted)|$($v.myVote)|$($v.myTopic)|$($v.route.to)|$(@($v.route.steps).Count)|$($v.route.count)|$([Math]::Ceiling($v.startsIn / 1000))|$($v.ride.pos)|$((@($v.board) | ForEach-Object { "$($_.pos):$($_.done)" }) -join ',')"
  if ($sig -eq $S.partySig) { return }; $S.partySig = $sig
  if ($ui.Party.Visibility -ne 'Visible') { $ui.Party.Visibility = 'Visible'; Pop $ui.Party 0 10 }
  $ui.PartyTower.Visibility = 'Collapsed'; $S.wordOn = $false; $ui.PartyButtons.Children.Clear(); $ui.PartyStop.Content = $null
  $ui.PartyStage.Text = ''; $ui.PartyStage.FontSize = 13; $ui.PartyStage.RenderTransform = $null
  $players = @($v.players)
  $S.partyTitle = "$($v.title) · $($v.floor) 층"
  if ($v.phase -eq 'lobby') {
    $S.partyTitle += " · $($players.Count)명"
    $ui.PartyText.Text = "$(if ($lobbyErr) { "⚠ $lobbyErr`n" })참가: $($players -join ', ')$(if ($v.kind -eq 'stack' -and $v.best) { "`n이 층 최고 기록: $($v.best)층" })"
    if ($v.kind -eq 'subway') {
      if ($v.route) { $ui.PartyStage.Text = "🚇 $($v.route.from) → $($v.route.to) · $($v.route.count)역$(if ($v.route.random) { ' (🎲 무작위)' })`n노선은 출발할 때 모두에게 공개돼요" }
      else { $ui.PartyStage.Text = "🚇 아직 경로를 안 정했어요`n(그냥 시작하면 무작위로 정해져요)" }
      if ($v.host) {
        $ui.PartyText.Text += "`n⬇ 출발역 도착역을 입력하고 Enter (예: 학동 암사)`n또는 🎲 무작위 경로 버튼"; $S.wordOn = $true; $ui.PartyWord.MaxLength = 30; $ui.PartyWord.Visibility = 'Visible'
        Party-Button $(if ($v.route.random) { '🎲 다시 뽑기' } else { '🎲 무작위 경로' }) @{ op = 'route-random' }
        if ($S.subFocus -ne $v.id) { $S.subFocus = $v.id; $w.Activate(); [void]$ui.PartyWord.Focus() }
      }
    }
    if (-not $v.joined) { Party-Button '참가' @{ op = 'join' } $true; Party-Button '숨기기' { Hide-Party } }
    elseif ($v.host) { Party-Button '시작' @{ op = 'start' } $true; Party-Button '닫기' @{ op = 'leave' } }
    else { Party-Button '나가기' @{ op = 'leave' } }
  } else {
    $cur = if ($null -ne $v.turn) { $players[$v.turn] } else { '' }
    if ($v.kind -eq 'stack') {
      $ui.PartyTower.Visibility = 'Visible'; Draw-Tower
      $ui.PartyText.Text = $(if ($v.phase -eq 'done') { "$($v.height)층$(if ($v.record) { ' 🏆 이 층 신기록!' } else { " (최고 $($v.best)층)" })`n$($v.how)" }
        elseif ($v.myTurn) { "내 차례! 그림을 눌러 떨어뜨려요$(if ($v.last.perfect) { "`n✨ 앞 사람 퍼펙트!" })" } else { "$cur 님 차례 · 지금 $($v.height)층" })
      if ($v.myTurn) { Party-Button '⬇ 떨어뜨리기' { Drop-Block } $true; $w.Activate() }
    }
    if ($v.kind -eq 'bomb') {
      $ui.PartyStage.Text = $(if ($v.phase -eq 'done') { '💥' } else { '💣' }); $ui.PartyStage.FontSize = 40
      if ($v.phase -eq 'done') { $ui.PartyText.Text = $v.how }
      elseif ($v.myTurn) {
        $ui.PartyText.Text = $(if ($v.canToss) { '내 손에 폭탄이! 누구에게 던질까요?' } else { '받았어요! 1초 뒤에 던질 수 있어요' })
        for ($i = 0; $i -lt $players.Count; $i++) { if ($i -ne $v.me) { Party-Button "→ $($players[$i])" @{ op = 'toss'; to = $i } $true (-not $v.canToss) } }
        if (-not $v.canToss) { After 1100 { Party-Do @{ op = 'state' } } $null }
      } else { $ui.PartyText.Text = "$cur 님이 폭탄을 들고 있어요 $(@('', '…째깍', '…째깍째깍', '…째깍째깍째깍!!')[[int]$v.heat])" }
    }
    if ($v.kind -eq 'words') {
      $chain = (@($v.words) | Select-Object -Last 6 | ForEach-Object { if ($_.word) { $_.word } else { "✖$($_.by)" } }) -join ' → '
      $ui.PartyStage.Text = $chain
      if ($v.phase -eq 'done') { $ui.PartyText.Text = $v.how }
      elseif ($v.myTurn) {
        $ui.PartyText.Text = "내 차례! 「$(@($v.starts) -join ' / ')」 로 시작하는 말 (Enter)"
        Word-Box 10
      } else {
        $out = if ($v.joined -and -not @($v.alive)[$v.me]) { "`n(나는 탈락, 구경 중)" } else { '' }
        $ui.PartyText.Text = "$cur 님 차례 · 「$(@($v.starts) -join ' / ')」$out"
      }
    }
    if ($v.kind -eq 'liar' -or $v.kind -eq 'fool') { Show-Liar $v $cur }
    if ($v.kind -eq 'subway') { Show-Subway $v }
    if ($v.phase -eq 'done') { Party-Button '닫기' { Hide-Party } } elseif (-not $v.joined) { Party-Button '숨기기' { Hide-Party } }
    else { Stop-Button $ui.PartyStop { Party-Do @{ op = 'leave' } } }
  }
  if (-not $S.wordOn) { $ui.PartyWord.Visibility = 'Collapsed' }
  $ui.PartyTitle.Text = $S.partyTitle
}

# 🏆 기록 도전 (server/records.js keeps the bests): played alone in its panel and timed
# here; the floor's top three underneath. Nothing goes to the hub until a try is finished.
# $S.recTry moves on whenever a try ends or is dropped, so a late timer or click is ignored.
$S.recGame = 'react'; $S.recBoard = $null; $S.recTry = 0; $S.recFloor = $null; $S.recMode = $null; $S.recGo = $false; $S.recNext = 1
$S.recClock = New-Object Diagnostics.Stopwatch
$RECORD_HOW = [ordered]@{
  react = @('⚡ 반응속도', "빨간 칸이 초록으로 바뀌는 순간 클릭!`n먼저 누르면 실격이에요.")
  order = @('🔢 1→25', "1부터 25까지 순서대로 빨리!`n첫 화면이 뜨는 순간부터 잽니다.")
  ten = @('⏱ 딱 10초', "시작하고 속으로 10초를 센 뒤 칸을 클릭!`n10초에 가까울수록 1등.")
}
function Record-Do($body) {
  $b = @{ floor = $S.recFloor }; foreach ($k in $body.Keys) { $b[$k] = $body[$k] }
  $r = Ask '/api/record' $b
  if ($r.error) { $ui.RecordText.Text = "⚠ $($r.error)"; return $null }
  if ($r.board) { $S.recBoard = $r.board }
  $r
}
function Record-Ms($game, $ms) {
  if ($game -eq 'react') { "${ms}ms" } elseif ($game -eq 'order') { '{0:0.00}초' -f ($ms / 1000) } else { '{0:0.00}초 차이' -f ($ms / 1000) }
}
function Record-Top {
  $b = if ($S.recBoard) { $S.recBoard.($S.recGame) } else { $null }
  $medal = @('🥇', '🥈', '🥉'); $lines = @(); $i = 0
  foreach ($r in @($b.top)) { if ($r) { $lines += "$($medal[$i]) $($r.name) · $($r.text)$(if ($r.me) { ' ◀ 나' })"; $i++ } }
  if (-not $lines.Count) { $lines += '아직 기록이 없어요 — 첫 1등이 되어 보세요' }
  if ($null -ne $b.mine -and -not (@($b.top) | Where-Object { $_.me })) { $lines += "내 최고 · $(Record-Ms $S.recGame $b.mine)" }
  $ui.RecordTop.Text = $lines -join "`n"
}
function Record-Button($text, $action, $hot = $false) {
  $btn = New-Object Windows.Controls.Button; $btn.Content = $text; $btn.Tag = $action
  $btn.Margin = New-Object Windows.Thickness 3; $btn.Padding = New-Object Windows.Thickness 10, 4, 10, 4; $btn.BorderThickness = 0
  $btn.FontFamily = New-Object Windows.Media.FontFamily 'Malgun Gothic'; $btn.FontSize = 13; $btn.Cursor = [Windows.Input.Cursors]::Hand
  $btn.Background = $conv.ConvertFrom($(if ($hot) { '#C99A2E' } else { '#3B355A' })); $btn.Foreground = [Windows.Media.Brushes]::White
  $btn.Add_Click({ param($src) & $src.Tag })
  [void]$ui.RecordButtons.Children.Add($btn)
}
# The choice of game and its top three, with a start button; $note is the last try's result.
function Record-Idle($note = '') {
  $S.recTry++; $S.recMode = $null
  $ui.RecordTitle.Text = "🏆 기록 도전 · $($S.recFloor) 층 TOP 3"
  $ui.RecordPick.Children.Clear()
  foreach ($game in $RECORD_HOW.Keys) {
    $btn = New-Object Windows.Controls.Button; $btn.Content = $RECORD_HOW[$game][0]; $btn.Tag = $game
    $btn.Margin = New-Object Windows.Thickness 2; $btn.Padding = New-Object Windows.Thickness 6, 3, 6, 3; $btn.BorderThickness = 0
    $btn.FontFamily = New-Object Windows.Media.FontFamily 'Malgun Gothic'; $btn.FontSize = 11; $btn.Cursor = [Windows.Input.Cursors]::Hand
    $on = $game -eq $S.recGame
    $btn.Background = $conv.ConvertFrom($(if ($on) { '#E9B949' } else { '#2E2A45' })); $btn.Foreground = $conv.ConvertFrom($(if ($on) { '#1E1B2E' } else { '#FFFFFF' }))
    $btn.Add_Click({ param($src) $S.recGame = $src.Tag; Record-Idle })
    [void]$ui.RecordPick.Children.Add($btn)
  }
  $ui.RecordPad.Visibility = 'Collapsed'; $ui.RecordGrid.Visibility = 'Collapsed'
  $ui.RecordText.Text = $(if ($note) { $note } else { $RECORD_HOW[$S.recGame][1] })
  Record-Top
  $ui.RecordButtons.Children.Clear()
  Record-Button '▶ 시작' { Record-Play } $true
  Record-Button '닫기' { $S.recTry++; $S.recMode = $null; $ui.Record.Visibility = 'Collapsed' }
}
function Record-Open($game) {
  $S.recFloor = (To); if ($game) { $S.recGame = $game }
  if ($ui.Record.Visibility -ne 'Visible') { $ui.Record.Visibility = 'Visible'; Pop $ui.Record 0 10 }
  Record-Idle; [void](Record-Do @{ op = 'board' }); Record-Top
}
function Record-Done($ms, $line) {
  $r = Record-Do @{ op = 'submit'; game = $S.recGame; ms = [int][Math]::Round($ms) }
  $extra = ''
  if ($r -and $r.result) { $sep = if ($r.result.best) { ' · ' } else { "`n" }; $extra = "$(if ($r.result.best) { "`n🎉 내 최고 기록!" })$(if ($r.result.first) { "$sep👑 지금 1등!" } elseif ($r.result.rank) { "$sep지금 $($r.result.rank)등" })" }
  Record-Idle "$line$extra"
  if ($ui.RecordButtons.Children.Count) { $ui.RecordButtons.Children[0].Content = '▶ 다시' }
}
function Record-Play {
  $S.recTry++; $try = $S.recTry; $S.recMode = $S.recGame
  $ui.RecordPick.Children.Clear(); $ui.RecordButtons.Children.Clear()
  Record-Button '그만' { Record-Idle }
  $w.Activate()
  if ($S.recGame -eq 'react') {
    $S.recGo = $false; $ui.RecordPad.Visibility = 'Visible'; $ui.RecordPad.Background = $conv.ConvertFrom('#C0392B'); $ui.RecordPadText.Text = '기다리세요…'
    $ui.RecordText.Text = '초록이 되면 클릭!'
    After (1500 + (Get-Random -Maximum 2500)) { param($try)
      if ($try -ne $S.recTry) { return }
      $S.recGo = $true; $ui.RecordPad.Background = $conv.ConvertFrom('#2ECC71'); $ui.RecordPadText.Text = '지금!'; $S.recClock.Restart()
    } $try
  }
  if ($S.recGame -eq 'order') {
    $ui.RecordGrid.Children.Clear(); $S.recNext = 1
    foreach ($n in (1..25 | Get-Random -Count 25)) {
      $btn = New-Object Windows.Controls.Button; $btn.Content = "$n"; $btn.Tag = $n; $btn.Margin = New-Object Windows.Thickness 2; $btn.BorderThickness = 0
      $btn.FontFamily = New-Object Windows.Media.FontFamily 'Malgun Gothic'; $btn.FontSize = 14; $btn.FontWeight = 'Bold'; $btn.Cursor = [Windows.Input.Cursors]::Hand
      $btn.Background = $conv.ConvertFrom('#3B355A'); $btn.Foreground = [Windows.Media.Brushes]::White
      $btn.Add_Click({ param($src)
        if ($S.recMode -ne 'order') { return }
        if ($src.Tag -ne $S.recNext) {
          $src.Background = $conv.ConvertFrom('#C0392B'); After 250 { param($x) if ($x.IsEnabled) { $x.Background = $conv.ConvertFrom('#3B355A') } } $src; return
        }
        $src.IsEnabled = $false; $src.Background = $conv.ConvertFrom('#1F1C30'); $S.recNext++
        if ($S.recNext -gt 25) { $ms = $S.recClock.ElapsedMilliseconds; $S.recMode = $null; Record-Done $ms "🔢 $('{0:0.00}' -f ($ms / 1000))초" }
        else { $ui.RecordText.Text = "다음: $($S.recNext)" }
      })
      [void]$ui.RecordGrid.Children.Add($btn)
    }
    $ui.RecordGrid.Visibility = 'Visible'; $ui.RecordText.Text = '1 부터!'; $S.recClock.Restart()
  }
  if ($S.recGame -eq 'ten') {
    $ui.RecordPad.Visibility = 'Visible'; $ui.RecordPad.Background = $conv.ConvertFrom('#2E2A45'); $ui.RecordPadText.Text = '속으로 하나, 둘, 셋…'
    $ui.RecordText.Text = '10초라고 생각될 때 칸을 클릭!'; $S.recClock.Restart()
  }
}
$ui.RecordPad.Add_MouseLeftButtonDown({
  if ($S.recMode -eq 'react') {
    if (-not $S.recGo) { Record-Idle '😅 너무 빨라요! 초록이 된 다음에 눌러요'; return }
    $ms = $S.recClock.ElapsedMilliseconds; $S.recMode = $null; Record-Done $ms "⚡ ${ms}ms"
  } elseif ($S.recMode -eq 'ten') {
    $ms = $S.recClock.ElapsedMilliseconds; $off = [Math]::Abs($ms - 10000); $S.recMode = $null
    if ($off -gt 10000) { Record-Idle "⏱ $('{0:0.00}' -f ($ms / 1000))초 — 너무 멀어서 기록하지 않아요"; return }
    Record-Done $off "⏱ $('{0:0.00}' -f ($ms / 1000))초에 멈췄어요`n🎯 10초보다 $('{0:0.00}' -f ($off / 1000))초 $(if ($ms -lt 10000) { '빨라요' } else { '늦어요' })"
  }
})

# Right-click menu and the tray icon: games by kind, my animal, the chat box, alerts, hide, off.
# Handlers name their sender $src, never $s: names ignore case, and $s would hide the
# window's state $S from every function they call.
# The menu wears the panels' dark rounded look instead of the system's grey one: its own
# templates, kept in the menu's resources since a context menu lives outside the window.
[xml]$mx = @'
<ResourceDictionary xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml">
 <Style x:Key="Menu" TargetType="ContextMenu">
  <Setter Property="FontFamily" Value="Malgun Gothic"/><Setter Property="FontSize" Value="12"/><Setter Property="Foreground" Value="#CFC9E6"/>
  <Setter Property="HasDropShadow" Value="False"/>
  <Setter Property="Template"><Setter.Value>
   <ControlTemplate TargetType="ContextMenu">
    <Border Background="#F51E1B2E" BorderBrush="#2E2A42" BorderThickness="1" CornerRadius="10" Padding="4" Margin="0,0,6,6">
     <Border.Effect><DropShadowEffect ShadowDepth="2" BlurRadius="8" Opacity="0.5"/></Border.Effect>
     <StackPanel IsItemsHost="True" KeyboardNavigation.DirectionalNavigation="Cycle"/></Border>
   </ControlTemplate>
  </Setter.Value></Setter>
 </Style>
 <Style x:Key="Sep" TargetType="Separator">
  <Setter Property="Template"><Setter.Value>
   <ControlTemplate TargetType="Separator"><Border Height="1" Margin="8,4" Background="#2A2640"/></ControlTemplate>
  </Setter.Value></Setter>
 </Style>
 <Style TargetType="MenuItem">
  <Setter Property="Foreground" Value="#CFC9E6"/>
  <Setter Property="Template"><Setter.Value>
   <ControlTemplate TargetType="MenuItem">
    <Border x:Name="Bd" Background="Transparent" CornerRadius="6" Padding="8,5,10,5" MinWidth="170">
     <Grid>
      <Grid.ColumnDefinitions><ColumnDefinition Width="18"/><ColumnDefinition Width="*"/><ColumnDefinition Width="Auto"/></Grid.ColumnDefinitions>
      <TextBlock x:Name="Check" Text="✓" Foreground="#8FB8A3" FontWeight="Bold" Visibility="Hidden" VerticalAlignment="Center"/>
      <ContentPresenter Grid.Column="1" ContentSource="Header" VerticalAlignment="Center"/>
      <TextBlock x:Name="Arrow" Grid.Column="2" Text="›" Foreground="#7D769E" FontSize="14" Margin="14,-2,0,0" Visibility="Collapsed" VerticalAlignment="Center"/>
      <Popup x:Name="PART_Popup" Placement="Right" HorizontalOffset="6" VerticalOffset="-9" AllowsTransparency="True" Focusable="False" PopupAnimation="Fade"
       IsOpen="{Binding IsSubmenuOpen, RelativeSource={RelativeSource TemplatedParent}}">
       <Border Background="#F51E1B2E" BorderBrush="#2E2A42" BorderThickness="1" CornerRadius="10" Padding="4" Margin="0,0,6,6">
        <Border.Effect><DropShadowEffect ShadowDepth="2" BlurRadius="8" Opacity="0.5"/></Border.Effect>
        <StackPanel IsItemsHost="True" KeyboardNavigation.DirectionalNavigation="Cycle"/></Border>
      </Popup>
     </Grid>
    </Border>
    <ControlTemplate.Triggers>
     <Trigger Property="IsHighlighted" Value="True"><Setter TargetName="Bd" Property="Background" Value="#2A2640"/></Trigger>
     <Trigger Property="IsChecked" Value="True"><Setter TargetName="Check" Property="Visibility" Value="Visible"/></Trigger>
     <Trigger Property="Role" Value="SubmenuHeader"><Setter TargetName="Arrow" Property="Visibility" Value="Visible"/></Trigger>
     <Trigger Property="IsEnabled" Value="False"><Setter Property="Opacity" Value="0.45"/></Trigger>
    </ControlTemplate.Triggers>
   </ControlTemplate>
  </Setter.Value></Setter>
 </Style>
 <!-- The see-through bar: a thin dark track, the filled part soft violet, a small round knob. -->
 <Style x:Key="Alpha" TargetType="Slider">
  <Setter Property="Template"><Setter.Value>
   <ControlTemplate TargetType="Slider">
    <Grid Height="18" Background="Transparent">
     <Border Height="4" CornerRadius="2" Background="#2A2640" VerticalAlignment="Center"/>
     <Track x:Name="PART_Track">
      <Track.DecreaseRepeatButton><RepeatButton Command="Slider.DecreaseLarge" Focusable="False"><RepeatButton.Template>
       <ControlTemplate TargetType="RepeatButton"><Border Height="4" CornerRadius="2" Background="#5E5486" VerticalAlignment="Center"/></ControlTemplate>
      </RepeatButton.Template></RepeatButton></Track.DecreaseRepeatButton>
      <Track.IncreaseRepeatButton><RepeatButton Command="Slider.IncreaseLarge" Focusable="False"><RepeatButton.Template>
       <ControlTemplate TargetType="RepeatButton"><Border Background="Transparent"/></ControlTemplate>
      </RepeatButton.Template></RepeatButton></Track.IncreaseRepeatButton>
      <Track.Thumb><Thumb><Thumb.Template>
       <ControlTemplate TargetType="Thumb"><Ellipse Width="12" Height="12" Fill="#B9B2D6"/></ControlTemplate>
      </Thumb.Template></Thumb></Track.Thumb>
     </Track>
    </Grid>
   </ControlTemplate>
  </Setter.Value></Setter>
 </Style>
 <!-- Holds a control (the see-through slider) with no highlight of its own. -->
 <Style x:Key="Plain" TargetType="MenuItem">
  <Setter Property="StaysOpenOnClick" Value="True"/>
  <Setter Property="Template"><Setter.Value>
   <ControlTemplate TargetType="MenuItem"><ContentPresenter ContentSource="Header" Margin="10,4,10,6"/></ControlTemplate>
  </Setter.Value></Setter>
 </Style>
 <!-- The menu's foot: the whole window's see-through bar on a darker strip, not an item. -->
 <Style x:Key="Foot" TargetType="MenuItem">
  <Setter Property="StaysOpenOnClick" Value="True"/>
  <Setter Property="Template"><Setter.Value>
   <ControlTemplate TargetType="MenuItem"><Border Background="#15131F" CornerRadius="7" Padding="10,5,8,5" Margin="0,2,0,0">
    <ContentPresenter ContentSource="Header"/></Border></ControlTemplate>
  </Setter.Value></Setter>
 </Style>
 <!-- A small grey caption over a group; not an item to click. -->
 <Style x:Key="Head" TargetType="MenuItem">
  <Setter Property="IsHitTestVisible" Value="False"/><Setter Property="Focusable" Value="False"/>
  <Setter Property="Template"><Setter.Value>
   <ControlTemplate TargetType="MenuItem">
    <TextBlock Text="{TemplateBinding Header}" Foreground="#7D769E" FontSize="11" FontWeight="Bold" Margin="10,6,10,2"/>
   </ControlTemplate>
  </Setter.Value></Setter>
 </Style>
</ResourceDictionary>
'@
$menu = New-Object Windows.Controls.ContextMenu
$menu.Resources = [Windows.Markup.XamlReader]::Load((New-Object System.Xml.XmlNodeReader $mx)); $menu.Style = $menu.Resources['Menu']
function Item($text, $action) { $i = New-Object Windows.Controls.MenuItem; $i.Header = $text; if ($action) { $i.Add_Click($action) }; $i }
function Head($text) { $i = New-Object Windows.Controls.MenuItem; $i.Header = $text; $i.Style = $menu.Resources['Head']; $i }
# A menu gives its separators its own style key, so ours is set on each one.
function Line { $l = New-Object Windows.Controls.Separator; $l.Style = $menu.Resources['Sep']; $l }
# The floor's games, by what they ask of you.
$GAMES = @(
  @('🖌 그림', @(@('catch', '🖍 캐치마인드'), @('relay', '🎨 이어 그리기'))),
  @('💬 말', @(@('words', '🔤 끝말잇기'), @('liar', '🕵️ 라이어 게임 (3명~)'), @('fool', '🤪 바보 라이어 (3명~)'))),
  @('⚡ 순발력', @(@('stack', '🏗 높이 쌓기'), @('bomb', '💣 폭탄 돌리기'))),
  # (The comma keeps a list of one a list: PowerShell would unroll it into its two strings.)
  @('⌨️ 타자', @(, @('subway', '🚇 지하철 레이스')))
)
# The chat's see-through level on a bar: dragging shows the box at once (opened if it was
# closed), and the level is kept when the mouse lets go.
# A see-through bar (30–100%): $change gets the level (0.3–1) while dragging, $done runs when
# the mouse lets go. Used in the chat box (the chat's own level) and in the right-click menu
# (the whole window: pets, chat and games at once).
function Bar($value, $width, $change, $done, $pct) {
  $row = New-Object Windows.Controls.StackPanel; $row.Orientation = 'Horizontal'
  $sl = New-Object Windows.Controls.Slider; $sl.Minimum = 30; $sl.Maximum = 100; $sl.Width = $width; $sl.Style = $menu.Resources['Alpha']; $sl.Value = [Math]::Round($value)
  $sl.IsMoveToPointEnabled = $true; $sl.VerticalAlignment = 'Center'
  $pc = $null
  if ($pct) { $pc = New-Object Windows.Controls.TextBlock; $pc.Width = 40; $pc.Foreground = $conv.ConvertFrom('#9A93BD'); $pc.FontSize = 11; $pc.Margin = New-Object Windows.Thickness 8, 0, 0, 0; $pc.VerticalAlignment = 'Center'; $pc.Text = "$([int]$sl.Value)%" }
  $sl.Tag = @{ pc = $pc; change = $change; done = $done; held = $false }
  $sl.Add_ValueChanged({ param($src)
    if ($src.Tag.pc) { $src.Tag.pc.Text = "$([int]$src.Value)%" }
    if ($src.IsMouseCaptureWithin -or $src.IsMouseOver) { $src.Tag.held = $true; & $src.Tag.change ($src.Value / 100) } })
  $sl.Add_PreviewMouseUp({ param($src) if ($src.Tag.held) { $src.Tag.held = $false; & $src.Tag.done } })
  $sl.Add_LostMouseCapture({ param($src) if ($src.Tag.held) { $src.Tag.held = $false; & $src.Tag.done } })
  [void]$row.Children.Add($sl); if ($pc) { [void]$row.Children.Add($pc) }
  $row
}
# The whole window's level, kept on this PC like the chat's.
$S.petA = 1.0
function Pet-Alpha($a) { $S.petA = [Math]::Max(0.3, [Math]::Min(1, [double]$a)); $w.Opacity = $S.petA }
function Save-PetAlpha { Call '/api/pet' @{ petAlpha = [Math]::Round($S.petA, 2) } | Out-Null }
# The chat's own bar, folded behind a faint ◐ at the box's top right (the size grip's pair):
# the mouse on it unfolds the bar on a dark strip over the lines; leaving folds it again,
# but never in the middle of a drag.
$S.chatBar = $null
$cb = Bar ($S.chatA * 100) 80 { param($a) $S.cDrag = $true; Chat-Size $S.chatW $S.chatH $a } { $S.cDrag = $false; Save-Chat; if (-not $ui.ChatAlphaRow.IsMouseOver) { Fold-ChatAlpha $true } } $true
$S.chatBarRow = $cb; $S.chatBar = $cb.Children[0]; $cb.Visibility = 'Collapsed'; $cb.Margin = New-Object Windows.Thickness 10, 0, 2, 0
$S.chatBar.Add_PreviewMouseLeftButtonDown({ $S.cDrag = $true })
$chip = New-Object Windows.Controls.Border; $chip.Width = 18; $chip.Height = 18; $chip.CornerRadius = 9; $chip.BorderThickness = 1
$chip.Background = $conv.ConvertFrom('#E61E1B2E'); $chip.BorderBrush = $conv.ConvertFrom('#4A4470')
$ct = New-Object Windows.Controls.TextBlock; $ct.Text = '◐'; $ct.FontSize = 10; $ct.Foreground = $conv.ConvertFrom('#CFC9E6'); $ct.HorizontalAlignment = 'Center'; $ct.VerticalAlignment = 'Center'; $chip.Child = $ct
[void]$ui.ChatAlphaIn.Children.Add($cb); [void]$ui.ChatAlphaIn.Children.Add($chip)
function Fold-ChatAlpha($fold) {
  $S.chatBarRow.Visibility = if ($fold) { 'Collapsed' } else { 'Visible' }
  $ui.ChatAlphaRow.Background = if ($fold) { [Windows.Media.Brushes]::Transparent } else { $conv.ConvertFrom('#F2181626') }
  $ui.ChatAlphaRow.Opacity = if ($fold) { 0.35 } else { 1 }
}
$ui.ChatAlphaRow.Add_MouseEnter({ Fold-ChatAlpha $false })
$ui.ChatAlphaRow.Add_MouseLeave({ if (-not $S.cDrag) { Fold-ChatAlpha $true } })
function Open-Game($kind) {
  if ($kind -eq 'relay') { Relay-Do @{ op = 'open' } } elseif ($kind -eq 'catch') { Relay-Do @{ op = 'open'; mode = 'catch' } } else { Party-Do @{ op = 'open'; kind = $kind } }
}
$menu.Add_Opened({
  $menu.Items.Clear()
  # On someone else's pet: only what is to do with them, a note or a game with just them.
  $p = $menu.PlacementTarget.DataContext
  if ($p -is [hashtable] -and $p.who) {
    [void]$menu.Items.Add((Head "$($p.name) 님"))
    $n = Item '✉️ 쪽지 보내기' { param($src) Note-To $src.Tag }; $n.Tag = $p; [void]$menu.Items.Add($n)
    $d = Item '⚔️ 1:1 대결 신청' $null
    foreach ($gm in @(@('quickdraw', '🤠 결투 (먼저 쏘기)'), @('roulette', '🔫 러시안 룰렛'), @('rps', '✊ 가위바위보 (3판 2선승)'))) {
      $it = Item $gm[1] { param($src) Duel-Do $src.Tag }; $it.Tag = @{ op = 'invite'; to = $p.who; game = $gm[0]; floor = $p.floor }; [void]$d.Items.Add($it)
    }
    [void]$menu.Items.Add($d)
    # 🦶 날려버리기: my animal goes over and sends theirs off into the sky (the hub says when not).
    $sm = Item '🦶 날려버리기' $null
    foreach ($hw in @(@('kick', '🦶 날아차기'), @('hammer', '🔨 뿅망치'))) {
      $it = Item $hw[1] { param($src) Smack-Do $src.Tag }; $it.Tag = @{ to = $p.who; how = $hw[0]; floor = $p.floor }; [void]$sm.Items.Add($it)
    }
    [void]$menu.Items.Add($sm)
    # ❄️ 눈덩이: thrown at once, no aiming; anyone can be hit.
    $sb = Item '❄️ 눈덩이 던지기' { param($src) Snowball-Do $src.Tag }; $sb.Tag = @{ to = $p.who; floor = $p.floor }; [void]$menu.Items.Add($sb)
    return
  }
  # On mine (or the window round the pets): everything else, folded by what it is for.
  [void]$menu.Items.Add((Head '나'))
  $fm = Item '🎣 낚시' $null
  if ($S.fish -or $S.fishLoop) { [void]$fm.Items.Add((Item '🎣 낚시 그만하기   /낚시' { Fish-Stop })) } else { [void]$fm.Items.Add((Item '🎣 낚시하기 (계속)   /낚시' { Fish-Go })) }
  if (-not $S.contest) { [void]$fm.Items.Add((Item '🏁 낚시대회 열기   /낚시대회' { Contest-Do @{ op = 'contest-open' } })) }
  [void]$fm.Items.Add((Item '📖 물고기 도감   /도감' { Book-Open }))
  [void]$fm.Items.Add((Item '⚒️ 낚싯대 강화   /강화' { Forge-Open }))
  [void]$menu.Items.Add($fm)
  $gm = Item '🎮 게임' $null
  foreach ($grp in $GAMES) {
    [void]$gm.Items.Add((Head "$($grp[0]) · 같이"))
    foreach ($kd in $grp[1]) { $it = Item $kd[1] { param($src) Open-Game $src.Tag }; $it.Tag = $kd[0]; [void]$gm.Items.Add($it) }
  }
  [void]$gm.Items.Add((Head '🏆 혼자 기록 도전 (층 TOP 3)'))
  foreach ($game in $RECORD_HOW.Keys) { $it = Item $RECORD_HOW[$game][0] { param($src) Record-Open $src.Tag }; $it.Tag = $game; [void]$gm.Items.Add($it) }
  [void]$menu.Items.Add($gm)
  # The rooms: their join codes on the hub; 🚪 방 이동 between the rooms I know, one at a time,
  # and a new one by its invite link.
  if ($S.state.hub) { [void]$menu.Items.Add((Item '📋 방 · 참가 코드' { Start-Open 'codes' })) }
  if ($S.state.setup) { [void]$menu.Items.Add((Item '👋 시작하기' { Start-Open 'member' })) }
  else {
    $mv = Item '🚪 방 이동' $null
    foreach ($room in @($S.state.rooms)) { $it = Item $(if ($room.name) { $room.name } else { '(이름 모름)' }) { param($src) Move-Room $src.Tag }; $it.Tag = $room; $it.IsChecked = [bool]$room.current; [void]$mv.Items.Add($it) }
    [void]$mv.Items.Add((Line)); [void]$mv.Items.Add((Item '🚪 내 방 관리…' { Start-Open 'codes' }))
    if (-not $S.state.hub) { [void]$mv.Items.Add((Item '🔗 참가 링크로 새 방 들어가기' { Start-Open 'join' })) }
    [void]$menu.Items.Add($mv)
  }
  # The animals as their own pictures, five to a row, mine in a gold frame; the name on hover.
  $mine = @($S.state.kinds | Where-Object { $_.kind -eq $S.state.kind })[0]
  $k = Item "🐾 내 동물$(if ($mine) { ": $($mine.name)" })" $null
  $grid = New-Object Windows.Controls.WrapPanel; $grid.Width = 5 * 40
  foreach ($o in $S.state.kinds) {
    $on = $o.kind -eq $S.state.kind
    $cell = New-Object Windows.Controls.Border; $cell.Width = 36; $cell.Height = 36; $cell.Margin = New-Object Windows.Thickness 2
    $cell.CornerRadius = 8; $cell.BorderThickness = 2; $cell.Cursor = [Windows.Input.Cursors]::Hand; $cell.ToolTip = $o.name
    $cell.BorderBrush = $(if ($on) { $conv.ConvertFrom('#FFD27A') } else { [Windows.Media.Brushes]::Transparent })
    $cell.Background = $conv.ConvertFrom($(if ($on) { '#3A3358' } else { '#01000000' }))
    $cell.Tag = @{ kind = $o.kind; on = $on }
    $img = New-Object Windows.Controls.Image; $img.Source = (Frames $o.kind)[0]; $img.Width = 26; $img.Height = 26
    [Windows.Media.RenderOptions]::SetBitmapScalingMode($img, 'NearestNeighbor'); $cell.Child = $img
    $cell.Add_MouseEnter({ param($src) if (-not $src.Tag.on) { $src.Background = $conv.ConvertFrom('#2E2A45') } })
    $cell.Add_MouseLeave({ param($src) if (-not $src.Tag.on) { $src.Background = $conv.ConvertFrom('#01000000') } })
    $cell.Add_MouseLeftButtonUp({ param($src) $menu.IsOpen = $false; if (-not $src.Tag.on) { Call '/api/pet' @{ kind = $src.Tag.kind } | Out-Null } })
    [void]$grid.Children.Add($cell)
  }
  $gi = New-Object Windows.Controls.MenuItem; $gi.Style = $menu.Resources['Foot']; $gi.Header = $grid
  [void]$k.Items.Add($gi)
  [void]$menu.Items.Add($k)
  $set = Item '⚙️ 설정' $null
  $b = Item '💭 말풍선으로 보기' { Call '/api/pet' @{ bubbles = -not [bool]$S.state.bubbles } }; $b.IsChecked = [bool]$S.state.bubbles; $b.ToolTip = '끄면 새 대화가 와도 빨간 점만'; [void]$set.Items.Add($b)
  $q = Item '🔕 윈도우 알림 끄기' { Call '/api/notify' @{ quiet = -not [bool]$S.state.quiet } | Out-Null }; $q.IsChecked = [bool]$S.state.quiet; [void]$set.Items.Add($q)
  $fo = Item '🎆 남이 쓴 효과 끄기' { Call '/api/pet' @{ fxOff = -not [bool]$S.state.fxOff } | Out-Null }; $fo.IsChecked = [bool]$S.state.fxOff; $fo.ToolTip = '/폭죽 · /춤 같은 채팅 효과를 내 화면에서만 끕니다 (대화창 줄은 그대로)'; [void]$set.Items.Add($fo)
  $so = Item '🦶 날려버리기 안 받기' { Call '/api/pet' @{ smackOff = -not [bool]$S.state.smackOff } | Out-Null }; $so.IsChecked = [bool]$S.state.smackOff; $so.ToolTip = '켜면 다른 사람이 내 동물을 발로 차거나 뿅망치로 날릴 수 없어요'; [void]$set.Items.Add($so)
  [void]$set.Items.Add((Item '💬 대화창 크기 처음대로' { Chat-Size 250 160 $S.chatA; Save-Chat }))
  # 🔄 Something stuck: this PC's office (and so the pets) ends and comes back in a few seconds.
  $rs = Item '🔄 팀 펫 다시 시작' { Say $S.members[''] '🔄' '다시 시작해요 — 몇 초 뒤에 돌아올게요' 3; [void](Call '/api/restart' @{}) }
  $rs.ToolTip = '뭔가 이상하거나 멈췄을 때: 프로그램이 꺼졌다가 몇 초 뒤 다시 켜집니다'; [void]$set.Items.Add($rs)
  [void]$menu.Items.Add($set)
  if ($S.state.news) { [void]$menu.Items.Add((Item '📦 이번 업데이트 보기' { Show-News $S.state.news $true })) }
  [void]$menu.Items.Add((Line))
  [void]$menu.Items.Add((Item $(if ($S.hotkey) { '🙈 잠깐 숨기기   Ctrl+Alt+Z' } else { '🙈 잠깐 숨기기' }) { $w.Hide() }))
  [void]$menu.Items.Add((Item '⏻ 펫 끄기' { Call '/api/pet' @{ on = $false }; $w.Close() }))
  # At the very bottom: the whole window's level, ◐ then the bar, on one dark strip.
  $foot = New-Object Windows.Controls.StackPanel; $foot.Orientation = 'Horizontal'; $foot.ToolTip = '전체 진하기 (펫·대화창·게임)'
  $ic = New-Object Windows.Controls.TextBlock; $ic.Text = '◐'; $ic.FontSize = 12; $ic.Foreground = $conv.ConvertFrom('#8F86B8'); $ic.VerticalAlignment = 'Center'; $ic.Margin = New-Object Windows.Thickness 0, 0, 8, 0
  [void]$foot.Children.Add($ic)
  [void]$foot.Children.Add((Bar ($S.petA * 100) 120 { param($a) $S.aDrag = $true; Pet-Alpha $a } { $S.aDrag = $false; Save-PetAlpha } $true))
  $ab = New-Object Windows.Controls.MenuItem; $ab.Style = $menu.Resources['Foot']; $ab.Header = $foot
  [void]$menu.Items.Add($ab)
})
$tray = New-Object Windows.Forms.NotifyIcon
$tray.Icon = New-Object Drawing.Icon '__ICON__'; $tray.Text = '팀 펫'; $tray.Visible = $true
function Toggle-Hide { if ($w.IsVisible) { $w.Hide(); Stop-Fx } else { $w.Show(); Anchor; Place-Fx; $d = 0; foreach ($m in $S.members.Values) { Pop $m.col $d; $d += 90 } } }
$tray.Add_MouseClick({ Toggle-Hide })
# Ctrl+Alt+Z hides everything at once from any app, and brings it back. A key taken by another
# program (or a failed compile) only loses the shortcut; the pet runs on. PetWin lets the chat
# effects' window pass every click through to the pets under it.
$S.hotkey = $null; $S.native = $false
try {
  Add-Type -ReferencedAssemblies System.Windows.Forms -TypeDefinition @'
using System; using System.Runtime.InteropServices; using System.Windows.Forms;
public class PetHotKey : NativeWindow, IDisposable {
  [DllImport("user32.dll")] static extern bool RegisterHotKey(IntPtr h, int id, uint mod, uint vk);
  [DllImport("user32.dll")] static extern bool UnregisterHotKey(IntPtr h, int id);
  public event EventHandler Pressed;
  public bool Ok;
  public PetHotKey(uint mod, uint vk) { CreateHandle(new CreateParams()); Ok = RegisterHotKey(Handle, 1, mod | 0x4000, vk); }
  protected override void WndProc(ref Message m) { if (m.Msg == 0x0312 && Pressed != null) Pressed(this, EventArgs.Empty); base.WndProc(ref m); }
  public void Dispose() { UnregisterHotKey(Handle, 1); DestroyHandle(); }
}
public static class PetWin {
  [DllImport("user32.dll")] static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] static extern int SetWindowLong(IntPtr h, int i, int v);
  // WS_EX_TRANSPARENT | WS_EX_LAYERED | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE
  public static void ClickThrough(IntPtr h) { SetWindowLong(h, -20, GetWindowLong(h, -20) | 0x20 | 0x80000 | 0x80 | 0x8000000); }
}
'@
  $S.native = $true
  $S.hotkey = New-Object PetHotKey 3, 0x5A
  if ($S.hotkey.Ok) { $S.hotkey.Add_Pressed({ Toggle-Hide }); $tray.Text = '팀 펫 (숨기기 Ctrl+Alt+Z)' } else { $S.hotkey.Dispose(); $S.hotkey = $null }
} catch { $S.hotkey = $null }
# 📦 After an update, what changed, once: folded it is one line, a click unfolds all of it, and ✕
# (or 15 s folded and untouched) puts it away for good. Never while the window is hidden
# (Ctrl+Alt+Z): the poll waits until the pets are back. The menu shows the newest again any time.
$S.news = $null; $S.newsShown = -1; $S.newsOpen = $false; $S.newsUntil = [datetime]::MaxValue
function News-Text {
  $items = @($S.news.items)
  $ui.NewsTitle.Text = "📦 업데이트됐어요 · $(@($items | ForEach-Object { $_.date }) -join ', ')"
  $ui.NewsList.Children.Clear()
  $ui.NewsText.Visibility = if ($S.newsOpen) { 'Collapsed' } else { 'Visible' }
  $ui.NewsList.Visibility = if ($S.newsOpen) { 'Visible' } else { 'Collapsed' }
  if ($S.newsOpen) {
    # One block per line with a little air between, so a wrapped line still reads as one.
    $add = { param($t, $color, $top) $tb = New-Object Windows.Controls.TextBlock; $tb.Text = $t; $tb.TextWrapping = 'Wrap'; $tb.FontFamily = New-Object Windows.Media.FontFamily 'Malgun Gothic'
      $tb.FontSize = 12; $tb.Foreground = $conv.ConvertFrom($color); $tb.Margin = New-Object Windows.Thickness 0, $top, 0, 0; [void]$ui.NewsList.Children.Add($tb) }
    foreach ($it in $items) {
      if ($items.Count -gt 1) { & $add "[$($it.date)]" '#8F86B8' 6 }
      foreach ($l in @($it.lines)) { & $add $l '#CFC9E6' 5 }
    }
    & $add '▴ 접기' '#7D769E' 7
  } else {
    $more = if ($items.Count -gt 1) { " · 이전 업데이트 $($items.Count - 1)개 더" } else { '' }
    $ui.NewsText.Text = "$($items[0].head)$more  ▾"
  }
}
function News-Clock { $S.newsUntil = $(if ($S.newsOpen) { [datetime]::MaxValue } else { (Get-Date).AddSeconds(15) }) }
function Show-News($v, $open) {
  if (-not $v) { return }
  $S.news = $v; $S.newsOpen = [bool]$open; News-Text; News-Clock
  if ($ui.News.Visibility -ne 'Visible') { $ui.News.Visibility = 'Visible'; Pop $ui.News 0 10 }
}
# 🆕 A newer release, ready (server/release-update.js): 지금 업데이트 puts it in and the program
# starts again on it (the pet goes away for a few seconds and comes back); 나중에 puts it off
# until this program starts again. The Mac app has its own pet (client/pet.js).
$S.updLater = ''
function Show-Update($u) {
  $ui.UpdText.Text = "🆕 새 버전 $($u.version) 이 나왔어요. 받아 두었으니 누르면 바로 바뀌어요."
  $ui.UpdButtons.Children.Clear()
  [void]$ui.UpdButtons.Children.Add((Start-Button '지금 업데이트' { Update-Now } '#2E8B57'))
  [void]$ui.UpdButtons.Children.Add((Start-Button '나중에' { $S.updLater = [string]$S.state.update.version; $ui.Upd.Visibility = 'Collapsed' }))
  if ($ui.Upd.Visibility -ne 'Visible') { $ui.Upd.Visibility = 'Visible'; Pop $ui.Upd 0 10 }
}
function Update-Now {
  $ui.UpdText.Text = '업데이트하는 중이에요… 몇 초 뒤 다시 켜져요.'
  $ui.UpdButtons.Children.Clear()
  $r = Ask-As '/api/release-now' 'POST' @{}
  if ($r.error) { $ui.UpdText.Text = "⚠ $($r.error)"; [void]$ui.UpdButtons.Children.Add((Start-Button '닫기' { $ui.Upd.Visibility = 'Collapsed' })) }
}
function Done-News {
  $ui.News.Visibility = 'Collapsed'
  if ($S.news -and $S.news.fresh) { $S.news.fresh = $false; Call '/api/pet' @{ newsSeen = [int]$S.news.n } | Out-Null }
}
# 🎆 Chat effects (server/team.js FX): drawn in a see-through window of their own over the pets
# and the room above them. It lets every click through (PetWin), so a few seconds of fireworks
# never get in the way. Nothing plays while the pets are hidden; others' can be turned off.
# Without PetWin (a failed compile) there are no effects at all rather than a window in the way.
$FX_CMDS = @('폭죽', '박수', '하트', 'ㅋㅋ', '눈', '비', '우산', '춤', '댄스', '눈사람')
$FX_ROOM = 190 # above the pets' window, for things to rise into
$DANCE_MS = 4000
$S.fxw = $null; $S.stage = $null; $S.rnd = New-Object Random
if ($S.native) {
  $fw = New-Object Windows.Window; $fw.WindowStyle = 'None'; $fw.AllowsTransparency = $true; $fw.Background = [Windows.Media.Brushes]::Transparent
  $fw.Topmost = $true; $fw.ShowInTaskbar = $false; $fw.ShowActivated = $false; $fw.ResizeMode = 'NoResize'; $fw.Focusable = $false; $fw.IsHitTestVisible = $false
  $fc = New-Object Windows.Controls.Canvas; $fc.IsHitTestVisible = $false; $fw.Content = $fc
  $fh = New-Object Windows.Interop.WindowInteropHelper $fw; [void]$fh.EnsureHandle(); [PetWin]::ClickThrough($fh.Handle)
  $S.fxw = $fw; $S.fxc = $fc
}
# Over the pets' window and FX_ROOM above it, as see-through as it; kept shown (empty) so an
# effect does not wait for a new window's first draw.
function Place-Fx {
  if (-not $S.fxw) { return }
  $f = $S.fxw; $f.Left = $w.Left; $f.Top = $w.Top - $FX_ROOM; $f.Width = [Math]::Max(1, $w.ActualWidth); $f.Height = $w.ActualHeight + $FX_ROOM
  $f.Opacity = $w.Opacity
  # Owned by the pets' window, so it stays over it whatever raises that one (a click, a door, a
  # box taking the keys): else the chat box covers the fishing bar. Only once the owner is shown.
  if ($w.IsVisible -and $f.Owner -ne $w) { $f.Owner = $w }
  if (-not $f.IsVisible) { $f.Show() }
  # Owned, it is over the pets already. Never take its Topmost off then: Windows takes the
  # owner's off with it (and puts back only the owned one's), and the pets fall behind every
  # window clicked after.
  if ($f.Owner -ne $w) { $f.Topmost = $false; $f.Topmost = $true }
}
# The pets' window grows and shrinks (the update card folds, a game panel closes) and stays
# pinned at its bottom right: the effects' window follows it every tick, or a pond and a rod
# would hang in the air where the pets used to be.
function Fx-Follow {
  if (-not $S.fxw -or -not $S.fxw.IsVisible) { return }
  $f = $S.fxw; $top = $w.Top - $FX_ROOM; $wd = [Math]::Max(1, $w.ActualWidth); $ht = $w.ActualHeight + $FX_ROOM
  if ($f.Left -ne $w.Left) { $f.Left = $w.Left }
  if ($f.Top -ne $top) { $f.Top = $top }
  if ($f.Width -ne $wd) { $f.Width = $wd }
  if ($f.Height -ne $ht) { $f.Height = $ht }
}
function Stop-Fx {
  if (-not $S.fxw) { return }
  if ($S.stage) { foreach ($d in @($S.stage.dancers)) { $hm = $S.members[$d.key]; if ($hm) { $hm.img.Visibility = 'Visible' } }; $S.stage = $null }
  foreach ($fk in @($S.frozen.Keys)) { $hm = $S.members[$fk]; if ($hm) { $hm.img.Visibility = 'Visible' } }; $S.frozen = @{}
  if ($S.snow) { foreach ($sm in @($S.snow.men.Values)) { $hm = $S.members[$sm.key]; if ($hm) { $hm.img.Visibility = 'Visible' } }; $S.snow = $null }
  if ($S.fish) { Fish-Stop }; $S.rods = @{}; $S.rodLive.Clear()
  if ($S.smk) { Smk-End }
  $S.wx = $null; $S.fxc.Children.Clear(); $S.fxw.Hide()
}
# Where a pet is in the effects' window: the middle of its head, its feet, its size (zoom and all).
function Fx-At($m) {
  $c = $m.img.ActualWidth / 2
  $top = $m.img.TranslatePoint((New-Object Windows.Point $c, 0), $w); $bot = $m.img.TranslatePoint((New-Object Windows.Point $c, $m.img.ActualHeight), $w)
  @{ x = $top.X; y = $top.Y + $FX_ROOM; foot = $bot.Y + $FX_ROOM; size = [Math]::Max(16, $bot.Y - $top.Y) }
}
function Fx-Add($el, $x, $y) { [Windows.Controls.Canvas]::SetLeft($el, $x); [Windows.Controls.Canvas]::SetTop($el, $y); [void]$S.fxc.Children.Add($el) }
function Fx-Drop($el, $ms) { After $ms { param($el) $S.fxc.Children.Remove($el) } $el }
function Fx-Text($t, $size, $color) {
  $tb = New-Object Windows.Controls.TextBlock; $tb.Text = $t; $tb.FontSize = $size; $tb.FontWeight = 'Bold'
  $tb.FontFamily = New-Object Windows.Media.FontFamily 'Segoe UI Symbol, Malgun Gothic'; $tb.Foreground = $conv.ConvertFrom($color); $tb
}
# Moves from (x, y) by (dx, dy) over $ms after $delay, fading out over its last part, then goes.
function Fx-Go($el, $x, $y, $dx, $dy, $ms, $delay, $ease = $null) {
  $el.Opacity = 0; $t = New-Object Windows.Media.TranslateTransform; $el.RenderTransform = $t; Fx-Add $el $x $y
  Anim $t ([Windows.Media.TranslateTransform]::XProperty) 0 $dx $ms $delay $ease
  Anim $t ([Windows.Media.TranslateTransform]::YProperty) 0 $dy $ms $delay $ease
  # Bright for most of the way, then quickly gone.
  $fade = New-Object Windows.Media.Animation.QuadraticEase; $fade.EasingMode = 'EaseIn'
  Anim $el ([Windows.UIElement]::OpacityProperty) 1 0 $ms $delay $fade
  Fx-Drop $el ($delay + $ms + 50)
}
function Fx-Pick($list) { $list[$S.rnd.Next($list.Count)] }
$FX_COLORS = @('#F4A261', '#E9C46A', '#7EE0C8', '#C3B1E1', '#F28482')
# 🎆 A rocket goes up from the pet's head and bursts into a ring of sparks.
function Burst($x, $y, $up, $delay) {
  $r = New-Object Windows.Shapes.Ellipse; $r.Width = 3; $r.Height = 7; $r.Fill = $conv.ConvertFrom('#FFE8B0')
  $ease = New-Object Windows.Media.Animation.QuadraticEase; $ease.EasingMode = 'EaseOut'
  Fx-Go $r ($x - 1.5) $y 0 (-$up) 380 $delay $ease
  $c = Fx-Pick $FX_COLORS; $c2 = Fx-Pick $FX_COLORS
  $flash = New-Object Windows.Shapes.Ellipse; $flash.Width = 14; $flash.Height = 14; $flash.Fill = $conv.ConvertFrom('#CCFFF4D6')
  Fx-Go $flash ($x - 7) ($y - $up - 7) 0 0 220 ($delay + 360)
  for ($i = 0; $i -lt 18; $i++) {
    $a = ($i + $S.rnd.NextDouble() * 0.5) / 18 * 2 * [Math]::PI; $rr = 28 + $S.rnd.Next(16); $sz = 3 + $S.rnd.Next(3)
    $sg = New-Object Windows.Shapes.Ellipse; $sg.Width = $sz; $sg.Height = $sz; $sg.Fill = $conv.ConvertFrom($(if ($i % 3) { $c } else { $c2 }))
    # Out in a ring, then a little lower: the sparks fall as they fade.
    Fx-Go $sg ($x - $sz / 2) ($y - $up) ([Math]::Cos($a) * $rr) ([Math]::Sin($a) * $rr + 14) 1000 ($delay + 360) $ease
  }
}
function Play-Fx($kind, $key, $data = $null) {
  if (-not $S.fxw -or -not $w.IsVisible) { return }
  $m = $S.members[$key]; if (-not $m -or -not $m.img.ActualWidth) { return }
  Place-Fx; $at = Fx-At $m; $hx = $at.x; $hy = $at.y
  switch ($kind) {
    'fireworks' { Burst ($hx - 26) $hy 85 0; Burst ($hx + 8) $hy 115 380; Burst ($hx + 34) $hy 70 760 }
    'clap' { for ($i = 0; $i -lt 3; $i++) { Fx-Go (Fx-Text '👏' 15 '#F4C27A') ($hx - 10 + ($i - 1) * 14) ($hy - 18) 0 -40 1100 ($i * 250) } }
    'heart' { for ($i = 0; $i -lt 6; $i++) { Fx-Go (Fx-Text '♥' (12 + $S.rnd.Next(7)) '#F28482') ($hx - 6 + $S.rnd.Next(-14, 15)) ($hy - 14) ($S.rnd.Next(-16, 17)) (-60 - $S.rnd.Next(30)) 1500 ($i * 180) } }
    'lol' { for ($i = 0; $i -lt 5; $i++) { Fx-Go (Fx-Text $(if ($i -eq 2) { '😂' } else { 'ㅋ' }) (13 + $S.rnd.Next(4)) '#E9C46A') ($hx - 8 + $S.rnd.Next(-18, 19)) ($hy - 16) ($S.rnd.Next(-10, 11)) (-45 - $S.rnd.Next(25)) 1100 ($i * 140) } }
    'snow' { Start-Wx 'snow' $key }
    'rain' { Start-Wx 'rain' $key }
    'umbrella' { Start-Wx 'umbrella' $key }
    'dance' { Dance $key $at }
    'snowman' { Snow-All }
    'snowball' { Snowball $key $data }
    'fish' { Fish-Show $key $at $data }
    'brag' { Brag $key $at $data }
    'fling' { Fling-Fx $key $at $data }
    'smack' { Smack-Watch $key $data }
  }
}
# 🦶 날려버리기 (server/smack.js), on the whole monitor the pets are on. The one who does it runs
# up to the other and stops just before the hit: on their own screen an arrow swings up and down
# (a click sets the angle), then a power gauge (a click sets the power) — then a spotlight drops on
# the two for a beat, the hit, and off the other flies, spinning, along an arc toward the far side
# of the screen (left from the right half, right from the left half), wind and sparkles round it,
# bounces two or three times lower each time, falls flat, gets up and runs back.
# Everyone on the floor sees the same angle and power, laid out on their own screen. It is drawn
# in a see-through window over the monitor that lets every click through; the one aiming gets a
# second, empty one on top for a few seconds that takes the clicks (and Space, Esc to stop).
# Every frame is drawn afresh from the time since its part began (a DrawingContext, like a canvas).
# Names here never reuse a global's in another case ($S, $w, $ui…): PowerShell does not tell them apart.
$SMK = @{ run = 0.4; strike = 0.22; spot = 0.6; grav = 1000; spacePw = 0.9 }
$S.smk = $null; $S.smkWin = $null; $S.smkSent = [datetime]::MinValue
function Ease3($u) { 1 - [Math]::Pow(1 - $u, 3) }
# 0.0 and 1.0, never 0 and 1, next to a fraction: Windows PowerShell takes [Math]::Min(1, 0.3) as
# whole numbers and gives 0 (a roll then stood still and jumped to its end).
function Clamp01($u) { [Math]::Max(0.0, [Math]::Min(1.0, $u)) }
function Smk-Angle($tt) { (40 + 28 * [Math]::Sin($tt * 1.7)) * [Math]::PI / 180 }
function Smk-Power($tt) { (1 - [Math]::Cos($tt * 2.2)) / 2 }
# 🚀 우주: a hit at 90% or more, at any angle. 🏀 골대: the hub puts a hoop somewhere along the way (in
# "reaches": a full-power 45° flight is one reach on every screen) and picks how the shot goes — clean
# through, off the rim or off the board, in or out (server/smack.js shotAt); every screen plays that.
function Smk-Space($deg, $pw) { $pw -ge $SMK.spacePw }
function Smk-Reach($sh) { [Math]::Max(100, $(if ($sh.dir -gt 0) { $sh.area.wd - 30 - $sh.bx } else { $sh.bx - 30 }) * 0.9) }
# Seconds to fall from $y0 up with $vy0 (up is more) down to the floor.
function Smk-FallT($y0, $vy0) { ($vy0 + [Math]::Sqrt([Math]::Max(0.0, $vy0 * $vy0 + 2 * $SMK.grav * $y0))) / $SMK.grav }
# Where the hoop stands on this screen: the ring's middle and height (above the one kicked) from
# the hub's spot for it, and the rest drawn to the pets' size — the ring a little wider than a pet,
# the board's face right behind it, standing boardH above the ring. The hub judges the shot in
# reaches; the flight is aimed at the spot of this drawing the hub says it meets (Smk-Plan).
function Smk-HoopGeo($sh) {
  $rch = Smk-Reach $sh; $dir = $sh.dir; $bcy = $sh.bfoot - $sh.bsz / 2
  $hcx = [Math]::Max(30, [Math]::Min($sh.area.wd - 30, $sh.bx + $dir * $sh.hoop.fx * $rch))
  $ringY = [Math]::Min($sh.hoop.fy * $rch, $bcy - 60); $rw = [Math]::Max(18, [Math]::Min(46, $sh.bsz * 0.8))
  @{ hcx = $hcx; ringY = $ringY; hpy = $bcy - $ringY; rw = $rw; rh = $rw * 0.3; boardH = $rw * 1.9; face = $hcx + $dir * $rw * 1.12 }
}
# The flight from the one kicked to ($tx across, $ty up from where it stood), at the angle it was
# kicked if that comes down onto the spot, else steeper: { vx; vy; t }. A parabola through the spot
# is still coming down there only when its slope at the start is more than twice the climb to it
# (its slope there is 2·climb − start).
function Smk-AimTo($sh, $tx, $ty) {
  $dxp = [Math]::Max(20, [Math]::Abs($tx - $sh.bx)); $tn = [Math]::Tan($sh.angle); $lo = $ty / $dxp
  if ($ty -gt 1 -and $tn -lt $lo * 2.2) { $tn = $lo * 2.6 }
  $tn = [Math]::Max(0.2, [Math]::Min(4.0, $tn))
  $ang = [Math]::Atan($tn); $cs = [Math]::Cos($ang)
  $v = [Math]::Sqrt($SMK.grav * $dxp * $dxp / (2 * $cs * $cs * [Math]::Max(1.0, $dxp * $tn - $ty)))
  @{ vx = $v * $cs; vy = $v * [Math]::Sin($ang); t = $dxp / ($v * $cs) }
}
# ⛳ The hole: fx reaches out on the ground. The drawing (a green, the cup, a flag) is to the pets'
# size, like the hoop's.
function Smk-GolfOf($go) { if ($go -and $null -ne $go.fx) { @{ fx = [double]$go.fx } } }
function Smk-GolfGeo($sh) {
  $cx = [Math]::Max(40, [Math]::Min($sh.area.wd - 40, $sh.bx + $sh.dir * $sh.golf.fx * (Smk-Reach $sh)))
  @{ cx = $cx; foot = $sh.bfoot; cup = [Math]::Max(9, $sh.bsz * 0.32); green = [Math]::Max(40, $sh.bsz * 1.7); pole = [Math]::Max(46, $sh.bsz * 2.1) }
}
function Smk-HoopOf($ho) { if ($ho -and $null -ne $ho.fx) { @{ fx = [double]$ho.fx; fy = [double]$ho.fy } } }
# Brushes and words are made once and kept (frozen): the scene is drawn every frame, and making
# them afresh each time slowed the frames enough that the gauge lagged behind the clicks.
$SMKC = @{ brush = @{}; word = @{} }
function Smk-Brush($color, $alpha = 1) {
  $al = [Math]::Round([double]$alpha, 2); $key = "$color|$al"; $b = $SMKC.brush[$key]; if ($b) { return $b }
  if ($SMKC.brush.Count -gt 600) { $SMKC.brush.Clear() }
  $c = [Windows.Media.ColorConverter]::ConvertFromString($color); $b = New-Object Windows.Media.SolidColorBrush $c; $b.Opacity = $al; $b.Freeze(); $SMKC.brush[$key] = $b; $b
}
function Smk-Pen($color, $thick, $alpha = 1) { $pn = New-Object Windows.Media.Pen (Smk-Brush $color $alpha), $thick; $pn.StartLineCap = 'Round'; $pn.EndLineCap = 'Round'; $pn }
function Smk-Pt($px, $py) { New-Object Windows.Point $px, $py }
# The monitor the pets are on (less its taskbar), in WPF units.
function Smk-Area {
  $kk = 1.0; try { $src = [Windows.PresentationSource]::FromVisual($w); if ($src) { $kk = $src.CompositionTarget.TransformToDevice.M11 } } catch {}
  $pt = New-Object System.Drawing.Point ([int](($w.Left + $w.ActualWidth / 2) * $kk)), ([int](($w.Top + $w.ActualHeight / 2) * $kk))
  # The working area, not the whole screen: a topmost window over the whole of a monitor counts
  # to Windows as a full-screen app, and it hides that monitor's taskbar.
  $bd = [Windows.Forms.Screen]::FromPoint($pt).WorkingArea
  @{ l = $bd.Left / $kk; t = $bd.Top / $kk; wd = $bd.Width / $kk; ht = $bd.Height / $kk }
}
# A pet on that monitor: the middle of it across, its feet, its size.
function Smk-Spot($m, $ar) {
  $c = $m.img.ActualWidth / 2
  $top = $m.img.TranslatePoint((Smk-Pt $c 0), $w); $bot = $m.img.TranslatePoint((Smk-Pt $c $m.img.ActualHeight), $w)
  @{ x = $w.Left + $top.X - $ar.l; foot = $w.Top + $bot.Y - $ar.t; size = [Math]::Max(16, $bot.Y - $top.Y) }
}
# The see-through window over the monitor, made once; clicks go through it.
function Smk-Stage($ar) {
  if (-not $S.smkWin) {
    $sw = New-Object Windows.Window; $sw.WindowStyle = 'None'; $sw.AllowsTransparency = $true; $sw.Background = [Windows.Media.Brushes]::Transparent
    $sw.Topmost = $true; $sw.ShowInTaskbar = $false; $sw.ShowActivated = $false; $sw.ResizeMode = 'NoResize'; $sw.Focusable = $false; $sw.IsHitTestVisible = $false
    $im = New-Object Windows.Controls.Image; $im.Stretch = 'None'; $im.HorizontalAlignment = 'Left'; $im.VerticalAlignment = 'Top'
    [Windows.Media.RenderOptions]::SetBitmapScalingMode($im, 'NearestNeighbor'); $sw.Content = $im
    $hh = New-Object Windows.Interop.WindowInteropHelper $sw; [void]$hh.EnsureHandle(); [PetWin]::ClickThrough($hh.Handle)
    $S.smkWin = $sw; $S.smkImg = $im
  }
  # As see-through as the pets (the ◐ bar), like the chat effects.
  $sw = $S.smkWin; $sw.Left = $ar.l; $sw.Top = $ar.t; $sw.Width = $ar.wd; $sw.Height = $ar.ht; $sw.Opacity = $w.Opacity
  if (-not $sw.IsVisible) { $sw.Show() }
}
# The 뿅망치 drawn once (squashed or not): a yellow handle with a red stripe, a red pleated barrel
# across its top with round yellow caps. Grip at (0, 0), straight up.
function Smk-HammerArt($sq) {
  $dg = New-Object Windows.Media.DrawingGroup; $dc = $dg.Open()
  $yel = Smk-Brush '#FFD34E'; $yedge = New-Object Windows.Media.Pen (Smk-Brush '#A8801A'), 1.5
  $dc.DrawRoundedRectangle($yel, $yedge, (New-Object Windows.Rect -3.5, -46, 7, 46), 3, 3)
  $dc.PushClip((New-Object Windows.Media.RectangleGeometry ((New-Object Windows.Rect -3.5, -46, 7, 46), 3, 3)))
  $str = New-Object Windows.Media.Pen (Smk-Brush '#E5484D'), 2.5
  for ($kq = -46; $kq -lt 6; $kq += 9) { $dc.DrawLine($str, (Smk-Pt -7 ($kq + 6)), (Smk-Pt 7 $kq)) }
  $dc.Pop()
  $len = 66 * (1 - 0.38 * $sq); $rr = 15 * (1 + 0.22 * $sq); $cy = -46 - $rr + 2
  $dc.DrawRoundedRectangle((Smk-Brush '#E5484D'), (New-Object Windows.Media.Pen (Smk-Brush '#8E1F2A'), 1.6), (New-Object Windows.Rect (-$len / 2), ($cy - $rr), $len, ($rr * 2)), 4, 4)
  $dark = New-Object Windows.Media.Pen (Smk-Brush '#8E1F2A'), 2; $lite = New-Object Windows.Media.Pen (Smk-Brush '#FFBEBE' 0.7), 1
  for ($i = 1; $i -lt 7; $i++) { $px = -$len / 2 + $len * $i / 7
    $dc.DrawLine($dark, (Smk-Pt $px ($cy - $rr + 1)), (Smk-Pt $px ($cy + $rr - 1))); $dc.DrawLine($lite, (Smk-Pt ($px + 2) ($cy - $rr + 2)), (Smk-Pt ($px + 2) ($cy + $rr - 2))) }
  $dc.DrawRoundedRectangle((Smk-Brush '#FFFFFF' 0.35), $null, (New-Object Windows.Rect (-$len / 2 + 4), ($cy - $rr + 3), ($len - 8), 4), 2, 2)
  foreach ($side in -1, 1) {
    $dc.DrawEllipse($yel, (New-Object Windows.Media.Pen (Smk-Brush '#A8801A'), 1.6), (Smk-Pt ($side * $len / 2) $cy), 7, ($rr + 1))
    $dc.DrawEllipse((Smk-Brush '#FFFFFF' 0.45), $null, (Smk-Pt ($side * $len / 2 - 1.5) ($cy - $rr * 0.45)), 2.2, ($rr * 0.3))
  }
  $dc.Close(); $dg.Freeze(); $dg
}
$S.smkHam = @((Smk-HammerArt 0), (Smk-HammerArt 0.5), (Smk-HammerArt 1))
# Held in a paw at (hx, hy) facing $dir (1 right, -1 left), turned by $rot about the paw (0 = up);
# $u: the pets' size against the 64 the art was made for.
function Smk-Held($dc, $hx, $hy, $rot, $sq, $dir, $u) {
  $dc.PushTransform((New-Object Windows.Media.TranslateTransform $hx, $hy)); $dc.PushTransform((New-Object Windows.Media.ScaleTransform $dir, 1))
  $dc.PushTransform((New-Object Windows.Media.RotateTransform ($rot * 180 / [Math]::PI))); $dc.PushTransform((New-Object Windows.Media.ScaleTransform (0.8 * $u * 0.69), (0.8 * $u * 0.69)))
  $dc.DrawDrawing($S.smkHam[[int][Math]::Round((Clamp01 $sq) * 2)]); $dc.Pop(); $dc.Pop(); $dc.Pop()
  $dc.PushTransform((New-Object Windows.Media.ScaleTransform (0.69 * $u), (0.69 * $u)))
  $dc.DrawEllipse((Smk-Brush '#F08A3C'), (New-Object Windows.Media.Pen (Smk-Brush '#7A3E12'), 2), (Smk-Pt 0 -2), 7, 6); $dc.DrawEllipse((Smk-Brush '#FFF3E0'), $null, (Smk-Pt $dir -1), 3, 2.5)
  $dc.Pop(); $dc.Pop()
}
# A pet's picture at (px, py) (its middle), turned, flipped to face left, squashed.
function Smk-Pet($dc, $frames, $fi, $px, $py, $size, $rot = 0, $flip = $false, $sx = 1, $sy = 1) {
  $dc.PushTransform((New-Object Windows.Media.TranslateTransform $px, $py)); $dc.PushTransform((New-Object Windows.Media.RotateTransform ($rot * 180 / [Math]::PI)))
  $dc.PushTransform((New-Object Windows.Media.ScaleTransform ($(if ($flip) { -1 } else { 1 }) * $sx), $sy))
  $dc.DrawImage($frames[$fi], (New-Object Windows.Rect (-$size / 2), (-$size / 2), $size, $size)); $dc.Pop(); $dc.Pop(); $dc.Pop()
}
# 🎣 One fishing goes with the rod, the line and the pond, all of it: its picture, taken at the
# start (Smk-RodPic), stays on the pet through the run, the flight and the bounces.
function Smk-PetA($dc, $frames, $fi, $px, $py, $size, $rot = 0, $flip = $false, $sx = 1, $sy = 1) { Smk-Pet $dc $frames $fi $px $py $size $rot $flip $sx $sy; Smk-Rod $dc $S.smk.rodA $px $py $size $rot }
function Smk-PetB($dc, $frames, $fi, $px, $py, $size, $rot = 0, $flip = $false, $sx = 1, $sy = 1) { Smk-Pet $dc $frames $fi $px $py $size $rot $flip $sx $sy; Smk-Rod $dc $S.smk.rodB $px $py $size $rot }
function Smk-Rod($dc, $rp, $px, $py, $size, $rot) {
  if (-not $rp) { return }
  $k = $size / $rp.size
  $dc.PushTransform((New-Object Windows.Media.TranslateTransform $px, $py)); $dc.PushTransform((New-Object Windows.Media.RotateTransform ($rot * 180 / [Math]::PI)))
  $dc.DrawImage($rp.pic, (New-Object Windows.Rect ($rp.ox * $k), ($rp.oy * $k), ($rp.w * $k), ($rp.h * $k))); $dc.Pop(); $dc.Pop()
}
# The rod a pet holds on my screen (a friend's, or mine while my line is in), as a picture laid
# out round the pet's middle; null when it holds none.
function Smk-RodPic($m) {
  $o = @(@($S.rods.Values) + @($(if ($S.fish) { $S.fish.rod })) | Where-Object { $_ -and $_.m -eq $m }) | Select-Object -First 1
  if (-not $o) { return $null }
  $mx = $o.mv.X; $my = $o.mv.Y; $vis = $o.el.Visibility
  try {
    # Its parts sit where the pet was when it was made ($o.at); moved since only by mv.
    $o.mv.X = 0; $o.mv.Y = 0; $o.el.Visibility = 'Visible'
    $bd = [Windows.Media.VisualTreeHelper]::GetDescendantBounds($o.el)
    if ($bd.IsEmpty -or $bd.Width -lt 1 -or $bd.Height -lt 1) { return $null }
    $vb = New-Object Windows.Media.VisualBrush $o.el; $vb.ViewboxUnits = 'Absolute'; $vb.Viewbox = $bd; $vb.Stretch = 'Fill'
    $dv = New-Object Windows.Media.DrawingVisual; $c = $dv.RenderOpen(); $c.DrawRectangle($vb, $null, (New-Object Windows.Rect 0, 0, $bd.Width, $bd.Height)); $c.Close()
    $rt = New-Object Windows.Media.Imaging.RenderTargetBitmap ([int][Math]::Ceiling($bd.Width * 2)), ([int][Math]::Ceiling($bd.Height * 2)), 192, 192, ([Windows.Media.PixelFormats]::Pbgra32)
    $rt.Render($dv); $rt.Freeze()
    $cx = $o.at.x; $cy = ($o.at.y + $o.at.foot) / 2
    @{ pic = $rt; ox = $bd.X - $cx; oy = $bd.Y - $cy; w = $bd.Width; h = $bd.Height; size = $o.at.size }
  } catch { $null } finally { $o.mv.X = $mx; $o.mv.Y = $my; $o.el.Visibility = $vis }
}
# A word, outlined dark, centred at (px, py).
function Smk-Word($dc, $text, $px, $py, $size, $color, $alpha = 1) {
  if ($size -lt 1 -or $alpha -le 0) { return }
  $al = [Math]::Round([double]$alpha, 2); $key = "$text|$([Math]::Round([double]$px, 1))|$([Math]::Round([double]$py, 1))|$([Math]::Round([double]$size, 1))|$color|$al"
  $hit = $SMKC.word[$key]; if ($hit) { $dc.DrawDrawing($hit); return }
  if ($SMKC.word.Count -gt 300) { $SMKC.word.Clear() }
  $wg = New-Object Windows.Media.DrawingGroup; $wdc = $wg.Open(); Smk-WordDraw $wdc $text $px $py $size $color $al; $wdc.Close(); $wg.Freeze()
  $SMKC.word[$key] = $wg; $dc.DrawDrawing($wg)
}
function Smk-WordDraw($dc, $text, $px, $py, $size, $color, $alpha) {
  $tf = New-Object Windows.Media.Typeface ((New-Object Windows.Media.FontFamily 'Malgun Gothic'), [Windows.FontStyles]::Normal, [Windows.FontWeights]::Black, [Windows.FontStretches]::Normal)
  $ft = New-Object Windows.Media.FormattedText $text, ([Globalization.CultureInfo]::CurrentUICulture), ([Windows.FlowDirection]::LeftToRight), $tf, $size, ([Windows.Media.Brushes]::White)
  $geo = $ft.BuildGeometry((Smk-Pt ($px - $ft.Width / 2) ($py - $ft.Height / 2)))
  $dc.PushOpacity($alpha); $dc.DrawGeometry((Smk-Brush $color), (New-Object Windows.Media.Pen (Smk-Brush '#14121D' 0.85), 4), $geo); $dc.DrawGeometry((Smk-Brush $color), $null, $geo); $dc.Pop()
}
function Smk-Shape($dc, $brush, $pen, $pts) {
  $fig = New-Object Windows.Media.PathFigure; $fig.StartPoint = $pts[0]; $fig.IsClosed = $true
  $fig.Segments.Add([Windows.Media.PolyLineSegment]::new([Windows.Point[]]@($pts | Select-Object -Skip 1), $true))
  $geo = New-Object Windows.Media.PathGeometry; $geo.Figures.Add($fig); $dc.DrawGeometry($brush, $pen, $geo)
}

# A show: who does it to whom (their keys in $S.members), how, and — once set — the angle and power.
function Smk-New($akey, $bkey, $how) {
  if (-not $S.native -or -not $w.IsVisible) { return $null }
  $ma = $S.members[$akey]; $mb = $S.members[$bkey]
  if (-not $ma -or -not $mb -or $ma -eq $mb -or -not $ma.img.ActualWidth -or -not $mb.img.ActualWidth -or $ma.bragging -or $mb.bragging) { return $null }
  $ar = Smk-Area; $pa = Smk-Spot $ma $ar; $pb = Smk-Spot $mb $ar
  @{ ma = $ma; mb = $mb; akey = $akey; bkey = $bkey; how = $how; kick = $how -ne 'hammer'; area = $ar; ax = $pa.x; afoot = $pa.foot; asz = $pa.size; bx = $pb.x; bfoot = $pb.foot; bsz = $pb.size
    dir = $(if ($pb.x -lt $ar.wd / 2) { 1 } else { -1 }); clock = [Diagnostics.Stopwatch]::StartNew(); pt0 = 0.0; phase = 'run'; mine = $false
    rodA = (Smk-RodPic $ma); rodB = (Smk-RodPic $mb)
    angle = 40 * [Math]::PI / 180; power = 0.6; path = $null; trail = New-Object Collections.ArrayList; sparks = New-Object Collections.ArrayList; rnd = New-Object Random }
}
function Smk-Phase($sh, $ph) { $sh.phase = $ph; $sh.pt0 = $sh.clock.Elapsed.TotalSeconds }
function Smk-Begin($sh) { Smk-Stage $sh.area; $S.smk = $sh }
function Smk-End {
  $sh = $S.smk; if (-not $sh) { return }
  if ($sh.catcher) { $sh.catcher.Close(); $sh.catcher = $null }
  $sh.ma.img.Visibility = 'Visible'; $sh.mb.img.Visibility = 'Visible'
  if ($S.smkImg) { $S.smkImg.Source = $null }; if ($S.smkWin) { $S.smkWin.Hide() }
  if ($sh.crowd) { foreach ($c in $sh.crowd) { $c.m.img.Visibility = 'Visible' } }
  $S.smk = $null
}
# 🚀 A trip to space: the moment the one hit flies off, the whole row gets up and dances,
# drawn right in the 날려버리기 picture (timers wait while it plays, so the pets' own 춤 would
# only start once it is over). The one who hit it dances too, once home.
function Smk-Crowd($sh) {
  $list = New-Object Collections.ArrayList; $i = 0
  foreach ($k in @($S.members.Keys)) {
    $m = $S.members[$k]; if (-not $m -or $m -eq $sh.ma -or $m -eq $sh.mb -or -not $m.img.ActualWidth -or $m.img.Visibility -ne 'Visible') { continue }
    $p = Smk-Spot $m $sh.area; [void]$list.Add(@{ m = $m; x = $p.x; foot = $p.foot; size = $p.size; seed = $i * 0.37 }); $i++
  }
  ,$list
}
function Smk-Dancer($dc, $frames, $x, $foot, $size, $t, $seed) {
  $up = [Math]::Min(1.0, $t / 0.2); $ts = $t + $seed
  $cy = $foot - $size / 2 - $size * 0.12 * $up - [Math]::Abs([Math]::Sin($ts * 10)) * $size * 0.12 * $up
  $flip = ([int][Math]::Floor($ts * 2.5) % 2) -eq 1
  Smk-Pet $dc $frames (@(0, 1, 3, 1)[[int][Math]::Floor($t * 8) % 4]) $x $cy $size ([Math]::Sin($ts * 7) * 0.28 * $up) $flip
  $nq = ($ts * 0.8) % 1
  Smk-Word $dc $(if (([int][Math]::Floor($ts * 0.8)) % 2) { '♫' } else { '♪' }) ([Math]::Round($x + [Math]::Sin($ts * 3) * 8)) ([Math]::Round(($foot - $size * 1.25 - $nq * 28) / 3) * 3) 13 '#FFD36E' ([Math]::Round(1 - $nq, 1))
}
# From the menu on someone's pet: ask the hub first (it holds the floor while I aim), then aim.
function Smack-Do($body) {
  if ($S.smk) { return }
  $r = Ask '/api/smack' @{ op = 'aim'; to = $body.to; how = $body.how; floor = $body.floor; hoop = $true }
  if ($r.error) { Say $S.members[''] '🦶' "⚠ $($r.error)" 4; return }
  $sh = Smk-New '' "$($body.floor)|$($body.to)" $body.how
  if (-not $sh) { [void](Ask '/api/smack' @{ op = 'cancel'; floor = $body.floor }); Say $S.members[''] '🦶' '⚠ 그 사람의 동물이 내 화면에 없어요' 4; return }
  $sh.mine = $true; $sh.body = $body; $sh.hoop = Smk-HoopOf $r.hoop; $sh.golf = Smk-GolfOf $r.golf
  # The clicks (and keys) while I aim: an empty window over the monitor, on top for a moment.
  $cw = New-Object Windows.Window; $cw.WindowStyle = 'None'; $cw.AllowsTransparency = $true; $cw.Background = $conv.ConvertFrom('#01000000')
  $cw.Topmost = $true; $cw.ShowInTaskbar = $false; $cw.ResizeMode = 'NoResize'; $cw.Cursor = [Windows.Input.Cursors]::Hand
  $cw.Left = $sh.area.l; $cw.Top = $sh.area.t; $cw.Width = $sh.area.wd; $cw.Height = $sh.area.ht
  $cw.Add_MouseLeftButtonDown({ Smk-Click }); $cw.Add_MouseRightButtonDown({ Smk-Cancel })
  $cw.Add_KeyDown({ param($o, $ev) if ($ev.Key -eq 'Space' -or $ev.Key -eq 'Return') { Smk-Click } elseif ($ev.Key -eq 'Escape') { Smk-Cancel } })
  $sh.catcher = $cw; Smk-Begin $sh; $cw.Show(); [void]$cw.Activate()
  # Left too long: let the floor go.
  After 20000 { param($x0) if ($S.smk -eq $x0 -and $x0.phase -in 'run', 'aim', 'power') { Smk-Cancel } } $sh
}
function Smk-Click {
  $sh = $S.smk; if (-not $sh -or -not $sh.mine) { return }
  $tt = $sh.clock.Elapsed.TotalSeconds - $sh.pt0
  # Drawing a frame takes a while and the click waits behind it; judge it by the gauge on screen.
  if ($sh.seen -and $sh.seen[0] -eq $sh.phase) { $tt = $sh.seen[1] }
  if ($sh.phase -eq 'aim') { $sh.angle = Smk-Angle $tt; Smk-Phase $sh 'power'; return }
  if ($sh.phase -ne 'power') { return }
  $sh.power = [Math]::Max(0.12, (Smk-Power $tt))
  $sh.catcher.Close(); $sh.catcher = $null
  $deg = [int][Math]::Round($sh.angle * 180 / [Math]::PI); $pw2 = [Math]::Round($sh.power, 2)
  # Fly by what the hub and everyone else get (whole degrees, power to two places), so a goal looks the same here.
  $sh.angle = $deg * [Math]::PI / 180; $sh.power = $pw2; $sh.space = Smk-Space $deg $pw2
  $r = Ask '/api/smack' @{ op = 'hit'; to = $sh.body.to; how = $sh.how; floor = $sh.body.floor; angle = $deg; power = $pw2 }
  if ($r.error) { Smk-End; Say $S.members[''] '🦶' "⚠ $($r.error)" 4; return }
  # How it goes at the hoop: the hub's pick, so it plays here as on everyone else's screen.
  $sh.shot = "$($r.shot)"; $sh.goal = [bool]$r.goal; $sh.shotDx = $r.dx; $sh.shotUp = $r.up; $sh.shotStop = $r.stop
  $S.smkSent = Get-Date; Smk-Phase $sh 'spot'
}
function Smk-Cancel {
  $sh = $S.smk; if (-not $sh -or -not $sh.mine) { return }
  [void](Ask '/api/smack' @{ op = 'cancel'; floor = $sh.body.floor }); Smk-End
}
# Someone on my floor did it (the hub said so): the same, with their angle and power.
function Smack-Watch($akey, $f) {
  if ($S.smk -or -not $f -or -not $f.to) { return }
  $sh = Smk-New $akey $(if ($f.me) { '' } else { "$($f.floor)|$($f.to)" }) $f.how
  if (-not $sh) { return }
  if ($null -ne $f.angle) { $sh.angle = [double]$f.angle * [Math]::PI / 180 }
  if ($null -ne $f.power) { $sh.power = [Math]::Max(0.12, [Math]::Min(1.0, [double]$f.power)) }
  $sh.space = [bool]$f.space; $sh.hoop = Smk-HoopOf $f.hoop; $sh.golf = Smk-GolfOf $f.golf; $sh.goal = [bool]$f.goal
  $sh.shot = $(if ($f.shot) { "$($f.shot)" } elseif ($sh.goal) { 'swish' } else { '' }); $sh.shotDx = $f.dx; $sh.shotUp = $f.up; $sh.shotStop = $f.stop
  Smk-Begin $sh
}
# The way the one hit goes, worked out once at the hit on this screen: the flight (the far side of
# the screen is full power at 45°), then bounces each lower and shorter.
function Smk-Plan($sh) {
  $ar = $sh.area; $dir = $sh.dir; $reach = $(if ($dir -gt 0) { $ar.wd - 30 - $sh.bx } else { $sh.bx - 30 }) * 0.9
  $v = [Math]::Sqrt([Math]::Max(100, $reach) * $SMK.grav) * [Math]::Pow($sh.power, 0.6)
  $vx = $v * [Math]::Cos($sh.angle); $vy = $v * [Math]::Sin($sh.angle); $px = $sh.bx; $t0 = 0.0; $legs = New-Object Collections.ArrayList
  $shot = "$($sh.shot)"
  if ($sh.golf -and $shot -in 'ace', 'roll-in', 'roll-short', 'lip-out') {
    # ⛳ It lands where the hub says (from the hole, in reaches, on this screen's reach), bounces as
    # any landing does (each lower and shorter), then rolls on at the last bounce's speed, slowing
    # evenly, to where the hub says it stops: right in the cup it sinks; rolling into it it drops in
    # at the speed it gets there; fast it hops the cup (덜컹!) and rolls on; short it stops before it.
    $geo = Smk-GolfGeo $sh; $cx = $geo.cx; $cup = $geo.cup; $rch = Smk-Reach $sh; $grv = $SMK.grav
    $clampX = { param($xx) [Math]::Max(30.0, [Math]::Min($ar.wd - 30.0, $xx)) }
    $dxr = $(if ($null -ne $sh.shotDx) { [double]$sh.shotDx } else { 0.0 }); $stopR = $(if ($null -ne $sh.shotStop) { [double]$sh.shotStop } else { $dxr })
    $tx = $(if ($shot -eq 'ace') { $cx } else { & $clampX ($cx + $dir * $dxr * $rch) })
    $fl = Smk-AimTo $sh $tx 0
    [void]$legs.Add(@{ t = 0.0; x = $sh.bx; vx = $fl.vx; vy = $fl.vy; y0 = 0; dur = $fl.t; flight = $true })
    $t0 = $fl.t
    if ($shot -eq 'ace') {
      [void]$legs.Add(@{ t = $t0; x = $cx; vx = 0; vy = 0; y0 = 0; dur = 0.45; flight = $false; sink = $true; quiet = $true })
      return @{ legs = $legs; land = $cx; done = $t0 + 0.45; goalT = $t0; hole = $true }
    }
    $total = [Math]::Max(12.0, ($stopR - $dxr) * $rch)   # how far it goes on after it lands
    $toCup = ($cx - $tx) * $dir                          # to the cup's middle (less than 0: past it)
    # The bounces: as high as any landing's (each 0.38 as high), each 0.7 as fast as the one before,
    # and after them a roll slowing at the green's rate ($fric) — the first bounce's speed set so it
    # all comes to rest where the hub says. Fewer bounces when they would carry it onto the cup.
    $fric = 320.0; $hs = @(); $vyb = $fl.vy * 0.38
    while ($hs.Count -lt 3 -and $vyb -ge 60) { $hs += $vyb; $vyb *= 0.38 }
    $limit = $(if ($toCup -gt $cup) { $toCup - $cup * 1.2 } else { [double]::MaxValue })
    while ($true) {
      $nb = $hs.Count; $span = 0.0
      for ($i = 0; $i -lt $nb; $i++) { $span += [Math]::Pow(0.7, $i) * 2 * $hs[$i] / $grv }
      $cr = [Math]::Pow(0.7, $nb); $qa = $cr * $cr / (2 * $fric)
      $u1 = [Math]::Min((-$span + [Math]::Sqrt($span * $span + 4 * $qa * $total)) / (2 * $qa), $fl.vx * 0.7)
      if ($nb -eq 0 -or $u1 * $span -le $limit) { break }
      $hs = @($hs | Select-Object -First ($nb - 1))
    }
    $x = $tx; $first = $true
    for ($i = 0; $i -lt $nb; $i++) {
      $bvx = $u1 * [Math]::Pow(0.7, $i); $bd = 2 * $hs[$i] / $grv
      [void]$legs.Add(@{ t = $t0; x = $x; vx = $bvx; vy = $hs[$i]; y0 = 0; dur = $bd; flight = $false; say = $(if ($first -and $shot -eq 'lip-out' -and $toCup -le $cup) { '덜컹!' } else { $null }) })
      $x += $dir * $bvx * $bd; $t0 += $bd; $first = $false
    }
    # The roll: on at the last bounce's speed (0.7 of it), slowing evenly over what is left.
    $left = [Math]::Max(0.0, $total - ($x - $tx) * $dir); $v0 = [Math]::Max(40.0, $u1 * $cr)
    $rollTo = { param($dist, $acc) if ($dist -le 0.5) { return 0.0 }; $vv = [Math]::Max(0.0, $v0 * $v0 - 2 * $acc * $dist); ($v0 - [Math]::Sqrt($vv)) / [Math]::Max(0.001, $acc) }
    $toCupNow = ($cx - $x) * $dir
    if ($shot -eq 'roll-in') {
      # Rolls on toward a stop just past the cup and drops in on the way.
      $dc = [Math]::Max(0.0, $toCupNow); $acc = $v0 * $v0 / (2 * [Math]::Max($left, $dc + 4)); $tr = & $rollTo $dc $acc
      if ($tr -gt 0) { [void]$legs.Add(@{ t = $t0; x = $x; vx = $v0; acc = $acc; vy = 0; y0 = 0; dur = $tr; flight = $false; roll = $true; quiet = $true }); $t0 += $tr }
      [void]$legs.Add(@{ t = $t0; x = $cx; vx = 0; vy = 0; y0 = 0; dur = 0.4; flight = $false; sink = $true; quiet = $true })
      return @{ legs = $legs; land = $cx; done = $t0 + 0.4; goalT = $t0; hole = $true }
    }
    if ($shot -eq 'roll-short') {
      $left = [Math]::Max(0.0, [Math]::Min($left, $toCupNow - $cup * 1.3))
      if ($left -gt 0.5) { $acc = $v0 * $v0 / (2 * $left); $tr = 2 * $left / $v0
        [void]$legs.Add(@{ t = $t0; x = $x; vx = $v0; acc = $acc; vy = 0; y0 = 0; dur = $tr; flight = $false; roll = $true; quiet = $true }); $t0 += $tr; $x += $dir * $left }
      return @{ legs = $legs; land = $x; done = $t0; goalT = -1 }
    }
    # Lip-out: rolling up to the cup (if it is still ahead) fast, a little hop over it (덜컹!), and on,
    # slower, to a stop.
    $acc = $v0 * $v0 / (2 * [Math]::Max($left, 1.0)); $v = $v0
    if ($toCupNow -gt $cup) {
      $dc = $toCupNow - $cup; $tr = & $rollTo $dc $acc
      if ($tr -gt 0) { [void]$legs.Add(@{ t = $t0; x = $x; vx = $v0; acc = $acc; vy = 0; y0 = 0; dur = $tr; flight = $false; roll = $true; quiet = $true }); $t0 += $tr }
      $x = $cx - $dir * $cup; $v = [Math]::Max(60.0, $v0 - $acc * $tr); $left = [Math]::Max(0.0, $left - $dc)
      # Over the cup at the speed it got there (a small hop, as long as the crossing takes).
      $hop = [Math]::Max(0.12, [Math]::Min(0.3, 2 * $cup / [Math]::Max(80.0, $v)))
      [void]$legs.Add(@{ t = $t0; x = $x; vx = 2 * $cup / $hop; vy = $grv * $hop / 2; y0 = 0; dur = $hop; flight = $false; say = '덜컹!' })
      $t0 += $hop; $x += $dir * 2 * $cup; $left = [Math]::Max(0.0, $left - 2 * $cup); $v *= 0.6
    }
    if ($left -gt 0.5) { $acc = $v * $v / (2 * $left); $tr = 2 * $left / $v
      [void]$legs.Add(@{ t = $t0; x = $x; vx = $v; acc = $acc; vy = 0; y0 = 0; dur = $tr; flight = $false; roll = $true; quiet = $true }); $t0 += $tr; $x += $dir * $left }
    $x = & $clampX $x
    return @{ legs = $legs; land = $x; done = $t0; goalT = -1 }
  }
  if ($sh.hoop -and $shot -in 'swish', 'rim-in', 'rim-out', 'bank-in', 'bank-out') {
    # 🏀 The flight goes right to where the hub says it meets the hoop, on this drawing of it: the
    # middle of the ring (clean through the net), the near or far rim (탕! a little hop in, or
    # springing away), or up the board's face (쿵! knocked back, down to the ring, in or off the rim
    # toward the one who kicked it). Through, it slides into the middle as it drops.
    $grv = $SMK.grav; $geo = Smk-HoopGeo $sh; $ringY = $geo.ringY; $hcx = $geo.hcx; $rw = $geo.rw
    $clampX = { param($xx) [Math]::Max(30, [Math]::Min($ar.wd - 30, $xx)) }
    $dxr = $(if ($null -ne $sh.shotDx) { [double]$sh.shotDx } else { 0 })
    if ($shot -like 'bank-*') {
      $up = $(if ($null -ne $sh.shotUp) { [double]$sh.shotUp } else { 0.5 })
      $tx = $geo.face - $dir * $sh.bsz * 0.32; $ty = $ringY + [Math]::Max(0.12, [Math]::Min(0.9, $up)) * $geo.boardH
    } elseif ($shot -like 'rim-*') { $tx = $hcx + $dir * $(if ($dxr -ge 0) { 1 } else { -1 }) * $rw * 0.85; $ty = $ringY + 3 }
    else { $tx = $hcx + $dir * [Math]::Max(-1, [Math]::Min(1.0, $dxr / 0.02)) * $rw * 0.3; $ty = $ringY }
    $fl = Smk-AimTo $sh $tx $ty
    [void]$legs.Add(@{ t = 0.0; x = $sh.bx; vx = $fl.vx; vy = $fl.vy; y0 = 0; dur = $fl.t; flight = $true })
    $t0 = $fl.t; $xAt = $tx; $vyAt = $fl.vy - $grv * $fl.t
    if ($shot -like 'bank-*') {
      # Off the board's face (쿵!): knocked back toward the ring, down to its height.
      $vBack = [Math]::Max(60, $fl.vx * 0.3); $vyB = [Math]::Min(0.0, $vyAt) * 0.3; $tDown = Smk-FallT ($ty - $ringY) $vyB
      [void]$legs.Add(@{ t = $t0; x = $tx; vx = -$vBack; vy = $vyB; y0 = $ty; dur = $tDown; flight = $false; say = '쿵!' })
      $t0 += $tDown; $xAt = & $clampX ($tx - $dir * $vBack * $tDown); $vyAt = $vyB - $grv * $tDown
    } elseif ($shot -eq 'rim-in') {
      # Off the rim: up a little and back down over the middle.
      $hop = 0.42
      [void]$legs.Add(@{ t = $t0; x = $xAt; vx = ($hcx - $xAt) * $dir / $hop; vy = $grv * $hop / 2; y0 = $ty; dur = $hop; flight = $false; say = '탕!' })
      $t0 += $hop; $xAt = $hcx; $vyAt = -$grv * $hop / 2
    }
    if ($shot -in 'swish', 'rim-in', 'bank-in') {
      $vDrop = [Math]::Min(-80, $vyAt * 0.35); $tDrop = Smk-FallT $ringY $vDrop; $goalT = $t0
      [void]$legs.Add(@{ t = $t0; x = $xAt; vx = ($hcx - $xAt) * $dir / [Math]::Max(0.05, $tDrop); vy = $vDrop; y0 = $ringY; dur = $tDrop; flight = $false; quiet = $true })
      $t0 += $tDrop
      [void]$legs.Add(@{ t = $t0; x = $hcx; vx = 0; vy = 200; y0 = 0; dur = 0.4; flight = $false })
      return @{ legs = $legs; land = $hcx; done = $t0 + 0.4; goalT = $goalT }
    }
    # Out: off the rim it springs back away from the board, toward the kicker, down to the floor,
    # and one small bounce.
    $side = -1
    $vyOut = 300; $vxOut = 240 * $side; $tOut = Smk-FallT $ringY $vyOut
    [void]$legs.Add(@{ t = $t0; x = $xAt; vx = $vxOut; vy = $vyOut; y0 = $ringY; dur = $tOut; flight = $false; say = '탕!' })
    $t0 += $tOut; $xAt = & $clampX ($xAt + $dir * $vxOut * $tOut)
    [void]$legs.Add(@{ t = $t0; x = $xAt; vx = $vxOut * 0.4; vy = 150; y0 = 0; dur = 0.3; flight = $false })
    $t0 += 0.3; $xAt = & $clampX ($xAt + $dir * $vxOut * 0.4 * 0.3)
    return @{ legs = $legs; land = $xAt; done = $t0; goalT = -1 }
  }
  for ($i = 0; $i -lt 4; $i++) {
    $dur = 2 * $vy / $SMK.grav; [void]$legs.Add(@{ t = $t0; x = $px; vx = $vx; vy = $vy; y0 = 0; dur = $dur; flight = ($i -eq 0) })
    $t0 += $dur; $px += $dir * $vx * $dur
    if ($px -lt 30 -or $px -gt $ar.wd - 30) { $px = [Math]::Max(30, [Math]::Min($ar.wd - 30, $px)); $vx = 0 }
    $vy *= 0.38; $vx *= 0.7; if ($vy -lt 60) { break }
  }
  @{ legs = $legs; land = $px; done = $t0 }
}
# A soft dark patch round the two (fading out to nothing — the rest of the screen as it was), a
# pool of light on them and a short cone of it from just above; it snaps in from wide to tight.
function Smk-Glow($dc, $cx, $cy, $rad, $stops) {
  $rg = New-Object Windows.Media.RadialGradientBrush; $rg.MappingMode = 'Absolute'; $rg.Center = Smk-Pt $cx $cy; $rg.GradientOrigin = Smk-Pt $cx $cy; $rg.RadiusX = $rad; $rg.RadiusY = $rad * 0.75
  foreach ($st2 in $stops) { $rg.GradientStops.Add((New-Object Windows.Media.GradientStop ([Windows.Media.Color]::FromArgb([byte]$st2[1], 10, 8, 18)), $st2[0])) }
  $dc.DrawEllipse($rg, $null, (Smk-Pt $cx $cy), $rad, ($rad * 0.75))
}
function Smk-Spotlight($dc, $sh, $kq) {
  $mx = ($sh.bx + $sh.nearX) / 2; $gy = $sh.bfoot - $sh.bsz * 0.6; $rr = $sh.bsz * 1.35 + 60 * [Math]::Max(0.0, 1 - $kq / 0.12)
  $on = [Math]::Min(1.0, $kq / 0.08); $big = $rr * 3.2
  Smk-Glow $dc $mx $gy $big @(@(0, 0), @(($rr / $big), 0), @(($rr * 1.3 / $big), (185 * $on)), @(0.75, (120 * $on)), @(1, 0))
  $top = $gy - $big * 0.75
  $cone = New-Object Windows.Media.LinearGradientBrush; $cone.MappingMode = 'Absolute'; $cone.StartPoint = Smk-Pt 0 $top; $cone.EndPoint = Smk-Pt 0 $gy
  $cone.GradientStops.Add((New-Object Windows.Media.GradientStop ([Windows.Media.Color]::FromArgb(0, 255, 244, 200)), 0)); $cone.GradientStops.Add((New-Object Windows.Media.GradientStop ([Windows.Media.Color]::FromArgb([byte](72 * $on), 255, 244, 200)), 1))
  Smk-Shape $dc $cone $null @((Smk-Pt ($mx - 14) $top), (Smk-Pt ($mx + 14) $top), (Smk-Pt ($mx + $rr * 1.1) $gy), (Smk-Pt ($mx - $rr * 1.1) $gy))
  $pool = New-Object Windows.Media.RadialGradientBrush ([Windows.Media.Color]::FromArgb([byte](90 * $on), 255, 244, 200)), ([Windows.Media.Color]::FromArgb(0, 255, 244, 200))
  $dc.DrawEllipse($pool, $null, (Smk-Pt $mx ($sh.bfoot - 2)), ($rr * 1.15), ($rr * 0.35))
}
function Smk-Gold($dc, $cx, $cy, $rad) {
  $gl = New-Object Windows.Media.RadialGradientBrush ([Windows.Media.Color]::FromArgb(150, 255, 215, 0)), ([Windows.Media.Color]::FromArgb(0, 255, 215, 0))
  $dc.DrawEllipse($gl, $null, (Smk-Pt $cx $cy), $rad, $rad)
}
# 🏀 The hoop, seen from the side and facing the one kicked, drawn to the pets' size: on the far
# side a pole on a weighted base with a short arm to the board (white, a red bar on its face where
# the square is), a short bracket to an orange ring (its back half behind the net, its front half
# over it), and a criss-cross net that tapers down and swings when one drops through ($sinceGoal
# seconds ago, or less than 0).
function Smk-Line($dc, $pen, $pts) { for ($i = 1; $i -lt $pts.Count; $i++) { $dc.DrawLine($pen, $pts[$i - 1], $pts[$i]) } }
function Smk-HoopBody($dc, $sh, $sinceGoal) {
  $geo = Smk-HoopGeo $sh; $dir = $sh.dir; $hpx = $geo.hcx; $hpy = $geo.hpy; $rw = $geo.rw; $rh = $geo.rh; $face = $geo.face; $foot = $sh.bfoot
  $bw = $rw * 0.3; $bTop = $hpy - $geo.boardH; $bH = $geo.boardH + $rw * 0.55; $back = $face + $dir * $bw
  $bl = [Math]::Min($face, $back)
  # The pole just behind the board, on a weighted base, and a short arm to the board.
  $poleX = $back + $dir * $rw * 0.55; $pw = [Math]::Max(4, $rw * 0.2)
  $dc.DrawEllipse((Smk-Brush '#000000' 0.2), $null, (Smk-Pt $poleX ($foot + 2)), ($rw * 0.8), ($rw * 0.16))
  $dc.DrawRoundedRectangle((Smk-Brush '#3B4152'), $null, (New-Object Windows.Rect ($poleX - $rw * 0.5), ($foot - $rw * 0.28), ($rw * 1.0), ($rw * 0.32)), 4, 4)
  $pTop = $bTop + $bH * 0.3
  $dc.DrawRoundedRectangle((Smk-Brush '#5A6275'), $null, (New-Object Windows.Rect ($poleX - $pw / 2), $pTop, $pw, ($foot - $rw * 0.26 - $pTop)), 2, 2)
  $dc.DrawRectangle((Smk-Brush '#8C94A8'), $null, (New-Object Windows.Rect ($poleX - $pw / 2 + 1), ($pTop + 2), ($pw * 0.3), ($foot - $rw * 0.3 - $pTop)))
  $dc.DrawRectangle((Smk-Brush '#5A6275'), $null, (New-Object Windows.Rect ([Math]::Min($back, $poleX)), ($pTop + $bH * 0.08), ([Math]::Abs($poleX - $back)), ($pw * 0.9)))
  # The board: white, a dark rim, its back shaded, the red bar on its face.
  $dc.DrawRoundedRectangle((Smk-Brush '#000000' 0.16), $null, (New-Object Windows.Rect ($bl + 2), ($bTop + 3), $bw, $bH), 3, 3)
  $dc.DrawRoundedRectangle((Smk-Brush '#FFFFFF'), (Smk-Pen '#2F3442' 2), (New-Object Windows.Rect $bl, $bTop, $bw, $bH), 3, 3)
  $dc.DrawRectangle((Smk-Brush '#D7DDE8'), $null, (New-Object Windows.Rect ($(if ($dir -gt 0) { $bl + $bw * 0.5 } else { $bl + 1.5 })), ($bTop + 1.5), ($bw * 0.45), ($bH - 3)))
  $dc.DrawRoundedRectangle((Smk-Brush '#E5484D'), $null, (New-Object Windows.Rect ($(if ($dir -gt 0) { $face + 1.5 } else { $face - 1.5 - $bw * 0.32 })), ($hpy - $rw * 1.05), ($bw * 0.32), ($rw * 0.95)), 1, 1)
  # The bracket from the ring to the board.
  $dc.DrawLine((Smk-Pen '#9A4A14' ([Math]::Max(3, $rw * 0.14))), (Smk-Pt ($hpx + $dir * $rw * 0.9) ($hpy + 1)), (Smk-Pt $face ($hpy + 1)))
  # The ring's back half.
  $ringW = [Math]::Max(3, $rw * 0.13); $rBack = @(); $rFront = @()
  for ($i = 0; $i -le 16; $i++) { $ga = [Math]::PI * $i / 16; $rBack += Smk-Pt ($hpx + [Math]::Cos($ga) * $rw) ($hpy - [Math]::Sin($ga) * $rh); $rFront += Smk-Pt ($hpx + [Math]::Cos($ga) * $rw) ($hpy + [Math]::Sin($ga) * $rh) }
  Smk-Line $dc (Smk-Pen '#B4501A' $ringW) $rBack
  # The net: three rows of loops, each narrower, swinging with a goal.
  $live = $sinceGoal -ge 0 -and $sinceGoal -lt 1.2
  $sway = $(if ($live) { [Math]::Sin($sinceGoal * 20) * (1.2 - $sinceGoal) * $rw * 0.22 } else { 0 })
  $hang = $rw * 1.1 * $(if ($sinceGoal -ge 0 -and $sinceGoal -lt 0.3) { 1 + 0.35 * (1 - $sinceGoal / 0.3) } else { 1 })
  $rows = @(); $n = 8
  foreach ($lv in 0, 0.34, 0.68, 1) {
    $half = $rw * (1 - 0.42 * $lv); $dy = $hang * $lv; $row = @()
    for ($i = 0; $i -le $n; $i++) { $ga = [Math]::PI * $i / $n; $row += Smk-Pt ($hpx + [Math]::Cos($ga) * $half + $sway * $lv) ($hpy + [Math]::Sin($ga) * $rh * (1 - 0.5 * $lv) + $dy) }
    $rows += ,$row
  }
  $np = Smk-Pen '#FFFFFF' ([Math]::Max(1.2, $rw * 0.055)) 0.92
  for ($r = 0; $r -lt 3; $r++) { for ($i = 0; $i -lt $n; $i++) { $dc.DrawLine($np, $rows[$r][$i], $rows[$r + 1][$i + 1]); $dc.DrawLine($np, $rows[$r][$i + 1], $rows[$r + 1][$i]) } }
  Smk-Line $dc (Smk-Pen '#FFFFFF' ([Math]::Max(1.0, $rw * 0.05)) 0.8) $rows[3]
  # The ring's front half, over the net, with a shine.
  Smk-Line $dc (Smk-Pen '#FF7A1A' $ringW) $rFront
  Smk-Line $dc (Smk-Pen '#FFC48A' ([Math]::Max(1.0, $ringW * 0.35)) 0.9) @($rFront[11..15])
}
# Drawn once and kept (frozen) while it stands still: drawn afresh every frame it more than tripled
# the time a frame takes, and the gauge (which a click is judged by) lagged behind. Only a net
# swinging after a goal is drawn live.
# ⛳ The hole, from the side: a green patch on the floor, the cup, a flag on a pole that lifts and
# flutters when one drops in. Kept still (frozen) like the hoop; only the moment of a goal is live.
function Smk-GolfBody($dc, $sh, $sinceGoal) {
  $geo = Smk-GolfGeo $sh; $cx = $geo.cx; $ft = $geo.foot; $cup = $geo.cup; $gr = $geo.green
  $dc.DrawEllipse((Smk-Brush '#3E9B4F' 0.9), (Smk-Pen '#2C7A3B' 2), (Smk-Pt $cx ($ft + 1)), $gr, ($gr * 0.2))
  $dc.DrawEllipse((Smk-Brush '#5BBF6A' 0.85), $null, (Smk-Pt ($cx - $gr * 0.15) ($ft)), ($gr * 0.7), ($gr * 0.12))
  $dc.DrawEllipse((Smk-Brush '#1B2A1E'), (Smk-Pen '#E8F5E9' 1.5 0.8), (Smk-Pt $cx ($ft + 1)), $cup, ($cup * 0.35))
  $live = $sinceGoal -ge 0 -and $sinceGoal -lt 1.2
  $lift = $(if ($live) { [Math]::Sin([Math]::Min(1.0, $sinceGoal / 0.3) * [Math]::PI / 2) * $geo.pole * 0.25 * (1.2 - $sinceGoal) / 1.2 } else { 0 })
  $pTop = $ft - $geo.pole - $lift; $pBot = $ft - $lift * 0.5
  $dc.DrawLine((Smk-Pen '#F2F2F2' ([Math]::Max(2, $cup * 0.18))), (Smk-Pt $cx $pBot), (Smk-Pt $cx $pTop))
  $dc.DrawLine((Smk-Pen '#9AA0AE' ([Math]::Max(1.0, $cup * 0.06))), (Smk-Pt ($cx + 1) $pBot), (Smk-Pt ($cx + 1) $pTop))
  $wave = $(if ($live) { [Math]::Sin($sinceGoal * 18) * $cup * 0.3 } else { 0 }); $fw = $geo.pole * 0.42; $fh = $geo.pole * 0.26; $fd = -$sh.dir
  Smk-Shape $dc (Smk-Brush '#E5484D') (Smk-Pen '#A12B30' 1.5) @((Smk-Pt $cx $pTop), (Smk-Pt ($cx + $fd * $fw) ($pTop + $fh * 0.5 + $wave)), (Smk-Pt $cx ($pTop + $fh)))
  $dc.DrawEllipse((Smk-Brush '#FFD34E'), $null, (Smk-Pt $cx ($pTop - 2)), ([Math]::Max(2, $cup * 0.2)), ([Math]::Max(2, $cup * 0.2)))
}
function Smk-GolfArt($dc, $sh, $sinceGoal, $now) {
  if (-not $sh.golfGeo) { $sh.golfGeo = Smk-GolfGeo $sh }
  $geo = $sh.golfGeo; $live = $sinceGoal -ge 0 -and $sinceGoal -lt 1.2
  if (-not $live -and $sh.golfPic) { $dc.DrawDrawing($sh.golfPic) }
  else {
    $gg = New-Object Windows.Media.DrawingGroup; $gdc = $gg.Open(); Smk-GolfBody $gdc $sh $sinceGoal; $gdc.Close(); $gg.Freeze()
    if (-not $live) { $sh.golfPic = $gg }
    $dc.DrawDrawing($gg)
  }
  $top = $geo.foot - $geo.pole
  if ($sh.mine -and $sh.phase -in 'aim', 'power') { Smk-Word $dc '홀컵에 쏙!' $geo.cx ($top - 16 - [Math]::Abs([Math]::Sin($now * 4)) * 5) 15 '#7EE07A' }
  if ($sinceGoal -ge 0 -and $sinceGoal -lt 1.6) {
    Smk-Gold $dc $geo.cx ($geo.foot - $geo.cup) ($geo.green * (0.6 + $sinceGoal * 0.5))
    Smk-Word $dc $(if ($sh.shot -eq 'ace') { '홀인원!' } else { '홀인!' }) $geo.cx ($top - 22 - $sinceGoal * 30) (32 + 8 * [Math]::Min(1.0, $sinceGoal * 4)) '#FFD700' $(if ($sinceGoal -gt 1) { 1 - ($sinceGoal - 1) / 0.6 } else { 1 })
  }
}
function Smk-HoopArt($dc, $sh, $sinceGoal, $now) {
  if (-not $sh.hoopGeo) { $sh.hoopGeo = Smk-HoopGeo $sh }
  $geo = $sh.hoopGeo; $hpx = $geo.hcx; $hpy = $geo.hpy; $rw = $geo.rw; $bTop = $hpy - $geo.boardH
  $live = $sinceGoal -ge 0 -and $sinceGoal -lt 1.2
  if (-not $live -and $sh.hoopPic) { $dc.DrawDrawing($sh.hoopPic) }
  else {
    $hg = New-Object Windows.Media.DrawingGroup; $hdc = $hg.Open(); Smk-HoopBody $hdc $sh $sinceGoal; $hdc.Close(); $hg.Freeze()
    if (-not $live) { $sh.hoopPic = $hg }
    $dc.DrawDrawing($hg)
  }
  if ($sh.mine -and $sh.phase -in 'aim', 'power') { Smk-Word $dc '골대에 쏙!' $hpx ($bTop - 14 - [Math]::Abs([Math]::Sin($now * 4)) * 5) 15 '#FF9F1C' }
  if ($sinceGoal -ge 0 -and $sinceGoal -lt 1.6) {
    Smk-Gold $dc $hpx $hpy ($rw * (1.4 + $sinceGoal))
    Smk-Word $dc '골!' $hpx ($bTop - 18 - $sinceGoal * 30) (34 + 8 * [Math]::Min(1.0, $sinceGoal * 4)) '#FFD700' $(if ($sinceGoal -gt 1) { 1 - ($sinceGoal - 1) / 0.6 } else { 1 })
  }
}
# 🚀 Hit too hard: off the top of the screen the way it was hit, a while adrift in space (a dark
# window near the top: stars, a ringed planet, the Earth small below), then back down where it
# stood. False once it is over.
function Smk-SpaceTrip($dc, $sh, $ff, $now) {
  $dir = $sh.dir; $u = $sh.bsz / 34; $bcy = $sh.bfoot - $sh.bsz / 2; $fb = $sh.mb.frames; $faceB = $dir -gt 0
  $rise = 1.0; $adrift = $rise + 3.0; $fall = $adrift + 0.7; $lie = $fall + 1; $up = $lie + 0.3
  $far = ($bcy + 90) / [Math]::Sin($sh.angle); $cosA = [Math]::Cos($sh.angle); $sinA = [Math]::Sin($sh.angle)
  if ($ff -lt $rise) {
    $e = [Math]::Pow($ff / $rise, 1.6); $px = $sh.bx + $dir * $cosA * $far * $e; $py = $bcy - $sinA * $far * $e
    $streak = Smk-Pen '#9BD0FF' 3 0.7
    for ($i = 0; $i -lt 5; $i++) { $off = ($i - 2) * 6 * $u; $ln = (30 + ($i % 2) * 24) * [Math]::Max(0.7, $u) * (0.5 + $ff)
      $dc.DrawLine($streak, (Smk-Pt ($px - $dir * $cosA * 20 * $u - $sinA * $off) ($py + $sinA * 20 * $u - $dir * $cosA * $off)), (Smk-Pt ($px - $dir * $cosA * (20 * $u + $ln) - $sinA * $off) ($py + $sinA * (20 * $u + $ln) - $dir * $cosA * $off))) }
    if ($ff -lt 0.8) { $sk = $ff / 0.8; for ($i = 0; $i -lt 6; $i++) { $ga = $i * [Math]::PI / 3 + 0.4; $dc.DrawEllipse((Smk-Brush '#E8E2D4' (0.6 * (1 - $sk))), $null, (Smk-Pt ($sh.bx + [Math]::Cos($ga) * (14 + 40 * $sk) * $u) ($sh.bfoot - 6 - [Math]::Abs([Math]::Sin($ga)) * 20 * $sk * $u)), ((6 + 14 * $sk) * $u), ((6 + 14 * $sk) * $u)) } }
    Smk-Word $dc '슈우웅~!' ($sh.bx + $dir * 40) ($bcy - 60 - $ff * 30) 22 '#9BD0FF' (1 - $ff / $rise)
    Smk-PetB $dc $fb 2 $px $py ($sh.bsz * (1 - 0.5 * $ff / $rise)) ($dir * $ff * 30) $faceB
  } elseif ($ff -lt $adrift) {
    $kq = ($ff - $rise) / ($adrift - $rise); $fade = [Math]::Max(0.0, [Math]::Min(1.0, [Math]::Min($kq / 0.1, (1 - $kq) / 0.12)))
    $boxW = [Math]::Min(340, $sh.area.wd - 40); $boxH = 190; $boxT = 30
    $boxL = [Math]::Max(20, [Math]::Min($sh.area.wd - $boxW - 20, $sh.bx + $dir * $cosA * $far - $boxW / 2))
    $dc.DrawRoundedRectangle((Smk-Brush '#0B1030' (0.96 * $fade)), (Smk-Pen '#7C6CF0' 2 $fade), (New-Object Windows.Rect $boxL, $boxT, $boxW, $boxH), 16, 16)
    for ($i = 0; $i -lt 30; $i++) { $stx = $boxL + 10 + ($i * 73) % ($boxW - 20); $sty = $boxT + 10 + ($i * 41) % ($boxH - 20); $tw = $fade * (0.35 + 0.65 * [Math]::Abs([Math]::Sin($now * 3 + $i)))
      $dc.DrawRectangle((Smk-Brush $(if ($i % 5) { '#FFFFFF' } else { '#FFE066' }) $tw), $null, (New-Object Windows.Rect ($stx - 1), ($sty - 1), $(if ($i % 3) { 2 } else { 3 }), $(if ($i % 3) { 2 } else { 3 }))) }
    $plx = $boxL + $boxW * 0.8; $ply = $boxT + $boxH * 0.3
    $dc.DrawEllipse((Smk-Brush '#F4A261' $fade), $null, (Smk-Pt $plx $ply), 20, 20); $dc.DrawEllipse((Smk-Brush '#E07A3F' (0.7 * $fade)), $null, (Smk-Pt ($plx - 5) ($ply + 6)), 9, 5)
    $dc.DrawEllipse($null, (Smk-Pen '#FFE066' 3 (0.9 * $fade)), (Smk-Pt $plx $ply), 32, 8)
    $erx = $boxL + $boxW * 0.16; $ery = $boxT + $boxH * 0.8
    $dc.DrawEllipse((Smk-Brush '#4CC9F0' $fade), $null, (Smk-Pt $erx $ery), 15, 15); $dc.DrawEllipse((Smk-Brush '#7EE07A' $fade), $null, (Smk-Pt ($erx - 4) ($ery - 3)), 7, 5); $dc.DrawEllipse((Smk-Brush '#7EE07A' $fade), $null, (Smk-Pt ($erx + 6) ($ery + 5)), 4, 3)
    if ($fade -gt 0.5) {
      $drx = $boxL + 50 + ($boxW - 100) * $kq; $dry = $boxT + $boxH * 0.52 + [Math]::Sin($now * 1.6) * 14
      Smk-PetB $dc $fb $(if (([int][Math]::Floor($now * 2)) % 2) { 3 } else { 2 }) $drx $dry ($sh.bsz * 0.9) ($now * 1.3) $faceB
      Smk-Word $dc '?' ($drx + 22 * $u) ($dry - 26 * $u) 16 '#FFFFFF' (0.5 + 0.5 * [Math]::Sin($now * 5))
    }
    Smk-Word $dc '우주까지 날아갔다!' ($boxL + $boxW / 2) ($boxT + $boxH + 22) 22 '#9BD0FF' $fade
  } elseif ($ff -lt $fall) {
    $kq = ($ff - $adrift) / ($fall - $adrift); Smk-PetB $dc $fb 2 $sh.bx (-20 + ($bcy + 20) * $kq * $kq) $sh.bsz ($dir * $kq * 6) $faceB
  } elseif ($ff -lt $lie) {
    $kq = $ff - $fall; $fl = [Math]::Min(1.0, $kq / 0.2); $sq = $(if ($kq -lt 0.1) { 0.25 } else { 0 })
    Smk-PetB $dc $fb 2 $sh.bx ($sh.bfoot - $sh.bsz * 0.32) $sh.bsz (-$dir * $fl * [Math]::PI / 2) $faceB (1 + $sq) (1 - $sq)
    Smk-Word $dc '털썩!' $sh.bx ($sh.bfoot - 46 - [Math]::Min($kq, 0.4) * 25) 22 '#7C6CF0' $(if ($kq -gt 0.7) { 1 - ($kq - 0.7) / 0.3 } else { 1 })
  } elseif ($ff -lt $up) {
    $kq = ($ff - $lie) / ($up - $lie); Smk-PetB $dc $fb ([int][Math]::Floor($now * 6) % 4) $sh.bx ($sh.bfoot - $sh.bsz * 0.32 - $sh.bsz * 0.18 * $kq) $sh.bsz (-$dir * (1 - $kq) * [Math]::PI / 2) $faceB
  } else { return $false }
  $true
}
function Smk-Frame {
  $sh = $S.smk; if (-not $sh) { return }
  if (-not $w.IsVisible) { Smk-End; return }
  $ar = $sh.area; $now = $sh.clock.Elapsed.TotalSeconds; $tt = $now - $sh.pt0; $dir = $sh.dir; $u = $sh.bsz / 34
  $kick = $sh.kick; $fr = [int][Math]::Floor($now * 6) % 4; $acy = $sh.afoot - $sh.asz / 2; $bcy = $sh.bfoot - $sh.bsz / 2
  # Where the one who does it stands to hit: just behind the other, on the side away from where it flies.
  $sh.nearX = $sh.bx - $dir * 22 * $u * $(if ($kick) { 1.2 } else { 1.5 }); $ncy = $sh.bfoot - $sh.asz / 2
  $faceA = $dir -lt 0; $faceB = $dir -gt 0  # the one hit looks at the one who does it
  if ($sh.phase -eq 'run' -and $tt -ge $SMK.run) { Smk-Phase $sh $(if ($sh.mine) { 'aim' } else { 'spot' }); $tt = 0 }
  if ($sh.phase -eq 'spot' -and $tt -ge $SMK.spot) { Smk-Phase $sh 'go'; $tt = 0; $sh.path = Smk-Plan $sh }
  # What this frame shows; a click is judged by it, not by the clock when the click gets through.
  $sh.seen = @($sh.phase, $tt)
  $sh.ma.img.Visibility = 'Hidden'; $sh.mb.img.Visibility = 'Hidden'
  $dg = New-Object Windows.Media.DrawingGroup; $dc = $dg.Open()
  $dc.DrawRectangle([Windows.Media.Brushes]::Transparent, $null, (New-Object Windows.Rect 0, 0, $ar.wd, $ar.ht))
  $fa = $sh.ma.frames; $fb = $sh.mb.frames
  $sinceGoal = $(if ($sh.goal -and $sh.path -and $sh.phase -eq 'go' -and $sh.path.goalT -ge 0) { $tt - $SMK.strike - $sh.path.goalT } else { -1 })
  if ($sh.hoop) { Smk-HoopArt $dc $sh $sinceGoal $now }
  if ($sh.golf) { Smk-GolfArt $dc $sh $sinceGoal $now }
  if ($sh.phase -in 'run', 'aim', 'power', 'spot') {
    if ($sh.phase -in 'aim', 'power') {
      # The dim round the two stays put while aiming: drawn once, then reused.
      if (-not $sh.aimGlow) { $gg = New-Object Windows.Media.DrawingGroup; $gdc = $gg.Open(); Smk-Glow $gdc (($sh.bx + $sh.nearX) / 2) ($sh.bfoot - $sh.bsz * 0.6) ($sh.bsz * 4) @(@(0, 40), @(0.6, 30), @(1, 0)); $gdc.Close(); $gg.Freeze(); $sh.aimGlow = $gg }
      $dc.DrawDrawing($sh.aimGlow)
    }
    if ($sh.phase -eq 'spot') { Smk-Spotlight $dc $sh $tt }
    $shake = if ($sh.phase -eq 'run') { 0 } else { [Math]::Sin($now * 50) * 1.2 }
    Smk-PetB $dc $fb $(if ($sh.phase -eq 'run') { $fr } else { 2 }) ($sh.bx + $shake) $bcy $sh.bsz 0 $faceB
    if ($sh.phase -eq 'run') {
      $q = Ease3 ($tt / $SMK.run); $fy = $acy + ($ncy - $acy) * $q
      Smk-PetA $dc $fa ([int][Math]::Floor($now * 10) % 4) ($sh.ax + ($sh.nearX - $sh.ax) * $q) ($fy - [Math]::Abs([Math]::Sin($tt * 22)) * 5 * $u) $sh.asz 0 $faceA
    } elseif ($kick) { Smk-PetA $dc $fa 1 ($sh.nearX - $dir * 4 * $u) ($ncy - 16 * $u + [Math]::Sin($now * 6) * 2) $sh.asz ($(if ($faceA) { 1 } else { -1 }) * [Math]::PI / 2) $faceA 1.1 0.9 }
    else { Smk-PetA $dc $fa 1 $sh.nearX $ncy $sh.asz ($dir * 0.2) $faceA; Smk-Held $dc ($sh.nearX + $dir * 9 * $u + [Math]::Sin($now * 40) * 1.2) ($ncy - 3 * $u) (-2.3) 0 $dir $u }
    if ($sh.phase -ne 'run') { Smk-Word $dc '!' $sh.bx ($bcy - 30 * $u) 22 '#FF5A5A' }
    if ($sh.phase -eq 'aim' -or $sh.phase -eq 'power') {
      # ① The arrow, swinging up and down from the one to be hit, the way it will fly.
      $ang = if ($sh.phase -eq 'aim') { Smk-Angle $tt } else { $sh.angle }
      $col = if ($sh.phase -eq 'aim') { '#FF9F1C' } else { '#2FBF71' }; $len = 70; $ox = $sh.bx + $dir * 8; $oy = $bcy
      # The track stays put for the phase: drawn once, then reused.
      if ($sh.decoFor -ne $sh.phase) {
        $dg2 = New-Object Windows.Media.DrawingGroup; $ddc = $dg2.Open()
        $guide = @(); for ($gd = 12; $gd -le 68; $gd += 4) { $ra = $gd * [Math]::PI / 180; $guide += Smk-Pt ($ox + $dir * [Math]::Cos($ra) * $len) ($oy - [Math]::Sin($ra) * $len) }
        $gp = Smk-Pen $col 2 0.3; for ($i = 1; $i -lt $guide.Count; $i++) { $ddc.DrawLine($gp, $guide[$i - 1], $guide[$i]) }
        $ddc.Close(); $dg2.Freeze(); $sh.deco = $dg2; $sh.decoFor = $sh.phase
      }
      $dc.DrawDrawing($sh.deco)
      $ex = $ox + $dir * [Math]::Cos($ang) * $len; $ey = $oy - [Math]::Sin($ang) * $len
      $dash = Smk-Pen $col 5; $dash.DashStyle = [Windows.Media.DashStyle]::new([double[]](0.4, 1.8), 0); $dc.DrawLine($dash, (Smk-Pt $ox $oy), (Smk-Pt $ex $ey))
      $at = [Math]::Atan2($ey - $oy, $ex - $ox)
      Smk-Shape $dc (Smk-Brush $col) $null @((Smk-Pt ($ex + [Math]::Cos($at) * 12) ($ey + [Math]::Sin($at) * 12)), (Smk-Pt ($ex + [Math]::Cos($at + 2.4) * 12) ($ey + [Math]::Sin($at + 2.4) * 12)), (Smk-Pt ($ex + [Math]::Cos($at - 2.4) * 12) ($ey + [Math]::Sin($at - 2.4) * 12)))
      Smk-Word $dc $(if ($sh.phase -eq 'aim') { '① 방향! 클릭' } else { "각도 $([Math]::Round($sh.angle * 180 / [Math]::PI))°" }) ($ox + $dir * 50) ($oy - 105) $(if ($sh.phase -eq 'aim') { 20 } else { 14 }) $col
      if ($sh.phase -eq 'power') {
        # ② The power gauge, filling and emptying.
        $pw = Smk-Power $tt; $gw = 130; $gh = 16; $gx = $sh.bx - $dir * 30 - $gw / 2; $gy = $bcy - 74
        $dc.DrawRoundedRectangle((Smk-Brush '#14121D' 0.9), (New-Object Windows.Media.Pen ([Windows.Media.Brushes]::White), 2), (New-Object Windows.Rect $gx, $gy, $gw, $gh), 8, 8)
        $gr = $sh.gaugeBrush
        if (-not $gr) {
          $gr = New-Object Windows.Media.LinearGradientBrush; $gr.MappingMode = 'Absolute'; $gr.StartPoint = Smk-Pt $gx 0; $gr.EndPoint = Smk-Pt ($gx + $gw) 0
          foreach ($stp in @(@('#7EE07A', 0), @('#FFD34E', 0.6), @('#FF5A5A', 1))) { $gr.GradientStops.Add((New-Object Windows.Media.GradientStop ([Windows.Media.ColorConverter]::ConvertFromString($stp[0])), $stp[1])) }
          $gr.Freeze(); $sh.gaugeBrush = $gr
        }
        $dc.DrawRoundedRectangle($gr, $null, (New-Object Windows.Rect ($gx + 3), ($gy + 3), ([Math]::Max(4, ($gw - 6) * $pw)), ($gh - 6)), 5, 5)
        # From 90% up it goes to space: that end of the gauge is marked.
        $sx0 = $gx + 3 + ($gw - 6) * $SMK.spacePw
        $dc.DrawRectangle($null, (New-Object Windows.Media.Pen (Smk-Brush '#4CC9F0'), 2), (New-Object Windows.Rect $sx0, ($gy + 1), (($gw - 6) * (1 - $SMK.spacePw) + 2), ($gh - 2)))
        Smk-Word $dc '우주' ($sx0 + ($gw - 6) * (1 - $SMK.spacePw) / 2) ($gy + $gh + 11) 11 '#9BD0FF'
        if ($pw -ge $SMK.spacePw) { $dc.DrawRoundedRectangle($null, (Smk-Pen '#4CC9F0' 3 0.9), (New-Object Windows.Rect ($gx - 2), ($gy - 2), ($gw + 4), ($gh + 4)), 9, 9) }
        Smk-Word $dc '② 힘! 클릭' ($gx + $gw / 2) ($gy - 18) 20 '#FF9F1C'
      }
      if ($sh.mine) { Smk-Word $dc '클릭 또는 Space · 취소 Esc' ($sh.bx - $dir * 30) ($bcy - 140) 13 '#CFC9E6' }
    }
  } else {
    # ── the hit and after (tt from the strike) ──
    if ($tt -lt 0.15) { $fl2 = New-Object Windows.Media.RadialGradientBrush ([Windows.Media.Color]::FromArgb([byte](200 * (1 - $tt / 0.15)), 255, 255, 255)), ([Windows.Media.Color]::FromArgb(0, 255, 255, 255)); $dc.DrawEllipse($fl2, $null, (Smk-Pt $sh.bx $bcy), ($sh.bsz * 3), ($sh.bsz * 3)) }
    $nx = $sh.nearX
    if ($tt -lt $SMK.strike) {
      $q = Ease3 ($tt / $SMK.strike)
      if ($kick) { Smk-PetA $dc $fa 1 ($nx - $dir * 4 * $u + $dir * 12 * $u * $q) ($ncy - 16 * $u + 10 * $u * $q) $sh.asz ($(if ($faceA) { 1 } else { -1 }) * [Math]::PI / 2) $faceA 1.1 0.9 }
      else {
        $rot = -2.3 + (-5.33 + 2.3) * $q; $hx = $nx + $dir * 9 * $u; $hy = $ncy - 3 * $u; $rad = 44 * 0.8 * $u * 0.69
        for ($i = 1; $i -le 10; $i++) { $a1 = -2.3 + ($rot + 2.3) * ($i - 1) / 10 - [Math]::PI / 2; $a2 = -2.3 + ($rot + 2.3) * $i / 10 - [Math]::PI / 2
          $dc.DrawLine((Smk-Pen '#7C6CF0' 5 0.45), (Smk-Pt ($hx + $dir * [Math]::Cos($a1) * $rad) ($hy + [Math]::Sin($a1) * $rad)), (Smk-Pt ($hx + $dir * [Math]::Cos($a2) * $rad) ($hy + [Math]::Sin($a2) * $rad))) }
        Smk-PetA $dc $fa 1 $nx $ncy $sh.asz (-$dir * 0.2) $faceA; Smk-Held $dc $hx $hy $rot $(if ($q -gt 0.85) { ($q - 0.85) / 0.15 } else { 0 }) $dir $u
      }
    } else {
      # Back home, along the row it came from.
      $q = Clamp01 (($tt - $SMK.strike - 0.35) / 0.5); $moving = $q -gt 0 -and $q -lt 1
      if ($sh.space -and $q -ge 1) { Smk-Dancer $dc $fa $sh.ax $sh.afoot $sh.asz ($tt - $SMK.strike - 0.85) 0.2 }
      else { Smk-PetA $dc $fa $(if ($moving) { [int][Math]::Floor($now * 10) % 4 } else { 0 }) ($nx + ($sh.ax - $nx) * (Ease3 $q)) ($ncy + ($acy - $ncy) * (Ease3 $q)) $sh.asz 0 $(if ($moving) { -not $faceA } else { $faceA }) }
      if (-not $kick -and $tt -lt $SMK.strike + 0.35) { $q2 = ($tt - $SMK.strike) / 0.3; Smk-Held $dc ($nx + $dir * 9 * $u) ($ncy - 3 * $u) (-5.33 - 0.35 * [Math]::Min(1.0, $q2)) $(if ($q2 -lt 1) { [Math]::Max(0.0, 1 - $q2) } else { 0 }) $dir $u }
    }
    if ($tt -ge $SMK.strike - 0.03 -and $tt -lt $SMK.strike + 0.4) {
      $q = ($tt - $SMK.strike + 0.03) / 0.43; $bp = Smk-Pen '#7C6CF0' 3 (1 - $q)
      for ($i = 0; $i -lt 10; $i++) { $ga = $i * [Math]::PI / 5; $r0 = (20 + 40 * $q) * $u * 0.7; $r1 = $r0 + 10
        $dc.DrawLine($bp, (Smk-Pt ($sh.bx + [Math]::Cos($ga) * $r0) ($bcy + [Math]::Sin($ga) * $r0)), (Smk-Pt ($sh.bx + [Math]::Cos($ga) * $r1) ($bcy + [Math]::Sin($ga) * $r1))) }
      Smk-Word $dc $(if ($kick) { '뻥!' } else { '뿅!' }) $sh.bx ($bcy - 44 * $u - $q * 16) 30 '#FF9F1C' (1 - $q * 0.5)
    }
    # ── the one hit ──
    $pl = $sh.path; $ff = $tt - $SMK.strike
    $lie = $pl.done + 1.4; $up = $lie + 0.3; $back = $up + [Math]::Abs($pl.land - $sh.bx) / 900
    if ($ff -ge 0 -and $sh.space) {
      if ($null -eq $sh.crowd) { $sh.crowd = Smk-Crowd $sh }
      foreach ($c in $sh.crowd) { $c.m.img.Visibility = 'Hidden'; Smk-Dancer $dc $c.m.frames $c.x $c.foot $c.size $ff $c.seed }
    }
    if ($ff -ge 0 -and $sh.space) { if (-not (Smk-SpaceTrip $dc $sh $ff $now)) { $dc.Close(); Smk-End; return } }
    elseif ($ff -lt 0) { Smk-PetB $dc $fb 2 $sh.bx $bcy $sh.bsz 0 $faceB }
    elseif ($ff -lt $pl.done) {
      $lg = $null; foreach ($l in $pl.legs) { if ($ff -lt $l.t + $l.dur) { $lg = $l; break } }
      if (-not $lg) { $lg = $pl.legs[$pl.legs.Count - 1] }
      $kq = $ff - $lg.t; $py = $(if ($lg.flat -or $lg.sink -or $lg.roll) { $bcy - $lg.y0 } else { $bcy - ($lg.y0 + $lg.vy * $kq - $SMK.grav * $kq * $kq / 2) }); $px = [Math]::Max(30, [Math]::Min($ar.wd - 30, $lg.x + $dir * $(if ($lg.roll) { $lg.vx * $kq - $lg.acc * $kq * $kq / 2 } else { $lg.vx * $kq })))
      if ($lg.flight) {
        [void]$sh.trail.Add((Smk-Pt $px $py))
        # Wind streaks behind it, and sparkles falling off.
        $wp = Smk-Pen '#7C6CF0' 3 (0.55 * [Math]::Min(1.0, 0.4 + $sh.power))
        for ($i = 0; $i -lt 5; $i++) { $oy2 = ($i - 2) * 7 * $u; $ln = (24 + ($i % 2) * 18 + [Math]::Sin($now * 30 + $i) * 6) * [Math]::Max(0.7, $u)
          $dc.DrawLine($wp, (Smk-Pt ($px - $dir * 22 * $u) ($py + $oy2)), (Smk-Pt ($px - $dir * (22 * $u + $ln)) ($py + $oy2))) }
        if ($sh.rnd.NextDouble() -lt 0.7) { [void]$sh.sparks.Add(@{ x = $px; y = $py; vx = ($sh.rnd.NextDouble() - 0.5) * 60; vy = -20 - $sh.rnd.NextDouble() * 40; t = $now; c = @('#FFD34E', '#FF9F1C', '#7C6CF0', '#2FBF71')[$sh.rnd.Next(4)] }) }
        Smk-PetB $dc $fb 2 $px $py $sh.bsz ($dir * $kq * (10 + 22 * $sh.power)) $faceB
      } elseif ($lg.sink) {
        # ⛳ Down into the cup: smaller and lower until it is gone.
        $q = [Math]::Min(1.0, $kq / $lg.dur); $zs = $sh.bsz * (1 - 0.9 * $q)
        if ($zs -gt 2) { Smk-PetB $dc $fb 2 $px ($sh.bfoot - $zs / 2 + $q * 6) $zs ($dir * $q * 4) $faceB }
      } elseif ($lg.roll) {
        # Rolling: it turns as far as it goes.
        $rolled = $lg.vx * $kq - $lg.acc * $kq * $kq / 2
        Smk-PetB $dc $fb 2 $px ($py + $sh.bsz * 0.04) $sh.bsz ($dir * $rolled / ($sh.bsz * 0.45)) $faceB
      } else { Smk-PetB $dc $fb 2 $px $py $sh.bsz ($dir * ($kq / $lg.dur) * [Math]::PI * 2) $faceB 1.1 0.92 }
      foreach ($l in @($pl.legs | Select-Object -Skip 1)) { $kb = $ff - $l.t; if (-not $l.quiet -and $kb -ge 0 -and $kb -lt 0.3) { Smk-Word $dc $(if ($l.say) { $l.say } else { '통!' }) $l.x ($sh.bfoot - [double]$l.y0 - 40 - $kb * 40) (18 * (1 - $kb / 0.6)) '#FF9F1C' (1 - $kb / 0.3) } }
    } elseif ($pl.hole -and $ff -lt $up) {
      # ⛳ Out of the cup again (퐁!), up in a little hop and down on its feet.
      $kb = $ff - $pl.done; $q = [Math]::Min(1.0, $kb / 0.5); $zs = $sh.bsz * (0.15 + 0.85 * (Ease3 $q))
      Smk-PetB $dc $fb $(if ($q -lt 1) { 2 } else { $fr }) $pl.land ($sh.bfoot - $zs / 2 - [Math]::Sin($q * [Math]::PI) * $sh.bsz * 0.8) $zs 0 $faceB
      if ($kb -lt 0.6) { Smk-Word $dc '퐁!' $pl.land ($sh.bfoot - $sh.bsz * 1.6 - $kb * 30) 20 '#7EE07A' (1 - $kb / 0.6) }
    } elseif ($ff -lt $lie) {
      $kb = $ff - $pl.done; $fl = [Math]::Min(1.0, $kb / 0.25); $sq = if ($kb -lt 0.1) { 0.2 } else { 0 }
      Smk-PetB $dc $fb 2 $pl.land ($sh.bfoot - $sh.bsz * 0.32) $sh.bsz (-$dir * $fl * [Math]::PI / 2) $faceB (1 + $sq) (1 - $sq)
      if ($kb -lt 0.6) { $qd = $kb / 0.6; foreach ($sd in -1, 1) { for ($j = 0; $j -lt 3; $j++) { $dc.DrawEllipse((Smk-Brush '#C9BFA6' (0.55 * (1 - $qd))), $null, (Smk-Pt ($pl.land + $sd * (14 + $qd * 30 + $j * 8) * $u) ($sh.bfoot - 4 - $j * 4 - $qd * 8)), (4 + $qd * 6), (4 + $qd * 6)) } } }
      Smk-Word $dc '털썩!' $pl.land ($sh.bfoot - 46 - [Math]::Min($kb, 0.4) * 25) 22 '#7C6CF0' $(if ($kb -gt 1) { 1 - ($kb - 1) / 0.4 } else { 1 })
      Smk-Word $dc "$('{0:0.0}' -f ([Math]::Abs($pl.land - $sh.bx) / 30))m" $pl.land ($sh.bfoot - 78) 16 '#2FBF71' $(if ($kb -gt 1.1) { 1 - ($kb - 1.1) / 0.3 } else { 1 })
    } elseif ($ff -lt $up) {
      $q = ($ff - $lie) / ($up - $lie)
      Smk-PetB $dc $fb $fr $pl.land ($sh.bfoot - $sh.bsz * 0.32 - $sh.bsz * 0.18 * $q) $sh.bsz (-$dir * (1 - $q) * [Math]::PI / 2) $faceB
    } elseif ($ff -lt $back) {
      $q = ($ff - $up) / ($back - $up); $px = $pl.land + ($sh.bx - $pl.land) * $q
      Smk-PetB $dc $fb ([int][Math]::Floor($now * 10) % 4) $px ($bcy - [Math]::Abs([Math]::Sin($ff * 20)) * 4) $sh.bsz 0 (-not $faceB)
      if ($sh.rnd.NextDouble() -lt 0.5) { [void]$sh.sparks.Add(@{ x = $px; y = $sh.bfoot - 4; vx = 0; vy = -10; t = $now; c = '#C9BFA6'; dust = $true }) }
    } else { $dc.Close(); Smk-End; return }
    # The dotted way it flew, fading after it lands.
    $ta = if ($ff -lt $pl.done) { 0.6 } else { [Math]::Max(0.0, 0.6 - ($ff - $pl.done) * 0.5) }
    if ($ta -gt 0) { $tb = Smk-Brush '#7C6CF0' $ta; for ($i = 0; $i -lt $sh.trail.Count; $i += 4) { $tp = $sh.trail[$i]; $dc.DrawRectangle($tb, $null, (New-Object Windows.Rect ($tp.X - 1.5), ($tp.Y - 1.5), 3, 3)) } }
    # Sparkles and dust: falling and fading over a second.
    for ($i = $sh.sparks.Count - 1; $i -ge 0; $i--) { if ($now - $sh.sparks[$i].t -ge 1) { $sh.sparks.RemoveAt($i) } }
    foreach ($sp in $sh.sparks) { $kq = $now - $sp.t; $sx2 = $sp.x + $sp.vx * $kq; $sy2 = $sp.y + $sp.vy * $kq + 60 * $kq * $kq; $br = Smk-Brush $sp.c (1 - $kq)
      if ($sp.dust) { $dc.DrawEllipse($br, $null, (Smk-Pt $sx2 $sy2), (3 + $kq * 6), (3 + $kq * 6)) }
      else { $dc.PushTransform((New-Object Windows.Media.TranslateTransform $sx2, $sy2)); $dc.PushTransform((New-Object Windows.Media.RotateTransform ($kq * 340)))
        $dc.DrawRectangle($br, $null, (New-Object Windows.Rect -3, -1, 6, 2)); $dc.DrawRectangle($br, $null, (New-Object Windows.Rect -1, -3, 2, 6)); $dc.Pop(); $dc.Pop() } }
  }
  # Cut to the screen: anything past an edge (one flying off to space) would grow the picture's
  # bounds and slide everything in it down for that frame.
  $dc.Close(); $dg.ClipGeometry = New-Object Windows.Media.RectangleGeometry (New-Object Windows.Rect 0, 0, $ar.wd, $ar.ht)
  $S.smkImg.Source = New-Object Windows.Media.DrawingImage $dg
}
[Windows.Media.CompositionTarget]::add_Rendering({ if ($S.smk) { try { Smk-Frame } catch { $S.smkErr = "$_ @$($_.InvocationInfo.ScriptLineNumber)"; Smk-End } } })
# 🏆 자랑하기 (도감 → 자랑하기): the one showing off hops up onto a golden stage with two warm
# lights, holds the fish up over its head (bobbing, twinkles round it) under a card with its name
# and size, then hops back down. One show at a time per pet.
$BRAG_MS = 4200
function Brag($key, $at, $f) {
  $m = $S.members[$key]; if (-not $m -or -not $f -or (-not $f.id -and $null -eq $f.rod) -or $m.bragging) { return }
  if ($S.stage -and @($S.stage.dancers | Where-Object { $_.key -eq $key }).Count) { return }
  $m.bragging = $true
  $ref = Fx-At $S.members['']; $unit = [Math]::Max(30, $at.size) + 8; $wd = $unit + 26
  $cx = [Math]::Max($wd, [Math]::Min($S.fxw.Width - $wd, $at.x)); $sy = $ref.y - 30
  # 🏁 A contest's podium (place 1-3): side by side in the middle, second on the left, first in
  # the middle and highest, third on the right, each step its medal's colour and number. It stands
  # on the pets' window's top edge, over the contest's board and the chat, not in front of them.
  $place = [int]$(if ($f.place) { $f.place } else { 0 }); $rise = 0
  $col = @{ top = '#C9A227'; edge = '#8C6A1E'; light = '#FFD666'; beam = '#33FFD666' }
  if ($place) {
    $gap = [Math]::Min($wd + 34, ($S.fxw.Width - 8) / 3)
    $cx = $S.fxw.Width / 2 + @(0, 0, -1, 1)[$place] * $gap; $rise = @(0, 30, 16, 6)[$place]
    $sy = [Math]::Min($sy, $FX_ROOM - 8) - $rise
    if ($place -eq 2) { $col = @{ top = '#AEB8C2'; edge = '#6E7A86'; light = '#E3E8EE'; beam = '#33E3E8EE' } }
    if ($place -eq 3) { $col = @{ top = '#C07A3E'; edge = '#7E4E26'; light = '#F0B07A'; beam = '#33F0B07A' } }
  }
  $el = New-Object Windows.Controls.Canvas; $el.IsHitTestVisible = $false; $S.fxc.Children.Insert(0, $el)
  foreach ($side in -1, 1) {
    $lx = $cx + $side * ($wd / 2 + 8); $ly = $sy - $unit * 1.7
    $beam = New-Object Windows.Shapes.Polygon; $beam.Fill = $conv.ConvertFrom($col.beam); $beam.Points = New-Object Windows.Media.PointCollection
    foreach ($p in @(@($lx, $ly), @(($cx - $side * $wd / 4), $sy), @(($cx + $side * $wd / 2), $sy))) { $beam.Points.Add((New-Object Windows.Point $p[0], $p[1])) }
    [void]$el.Children.Add($beam)
    $bulb = New-Object Windows.Shapes.Ellipse; $bulb.Width = 7; $bulb.Height = 7; $bulb.Fill = $conv.ConvertFrom($col.light)
    [Windows.Controls.Canvas]::SetLeft($bulb, $lx - 3.5); [Windows.Controls.Canvas]::SetTop($bulb, $ly - 3.5); [void]$el.Children.Add($bulb)
  }
  $board = New-Object Windows.Controls.Border; $board.Width = $wd; $board.Height = 8 + $rise; $board.CornerRadius = $(if ($place) { 3 } else { 4 })
  $board.Background = $conv.ConvertFrom($col.top); $board.BorderBrush = $conv.ConvertFrom($col.edge); $board.BorderThickness = 1
  if ($place) { $num = Fx-Text "$place" 12 '#FFFFFF'; $num.HorizontalAlignment = 'Center'; $num.VerticalAlignment = 'Center'; $board.Child = $num }
  [Windows.Controls.Canvas]::SetLeft($board, $cx - $wd / 2); [Windows.Controls.Canvas]::SetTop($board, $sy); [void]$el.Children.Add($board)
  Anim $el ([Windows.UIElement]::OpacityProperty) 0 1 250 0 $null
  # The pet hops up onto the stage (a copy, while the one in the row steps aside).
  $img = New-Object Windows.Controls.Image; $img.Width = $at.size; $img.Height = $at.size; $img.Stretch = 'Fill'; $img.Source = $m.frames[0]; $img.IsHitTestVisible = $false
  [Windows.Media.RenderOptions]::SetBitmapScalingMode($img, 'NearestNeighbor')
  $pos = New-Object Windows.Media.TranslateTransform; $img.RenderTransform = $pos
  Fx-Add $img ($at.x - $at.size / 2) ($at.foot - $at.size)
  $m.img.Visibility = 'Hidden'
  $dx = $cx - $at.x; $dy = $sy - $at.foot
  $hop = New-Object Windows.Media.Animation.BackEase; $hop.Amplitude = 0.8
  Anim $pos ([Windows.Media.TranslateTransform]::XProperty) 0 $dx 450 0 $null
  Anim $pos ([Windows.Media.TranslateTransform]::YProperty) 0 $dy 450 0 $hop
  # The fish up over the head with its card, once the pet stands on the stage.
  $fw = $(if ($place) { 48 } elseif ($f.rarity -eq 'legend') { 76 } elseif ($f.rarity -eq 'epic') { 66 } else { 58 })
  $news = @(); if ($f.record) { $news += , @('층 최대어', '#F2C14E', '#2A2000') }
  $head = $(if ($place) { "$(@('', '🥇', '🥈', '🥉')[$place]) $($place)등" } else { '🏆' })
  $live = @()
  if ($null -ne $f.rod) {
    # 🎣 A rod shown off: its picture big enough to see the detail, its sky behind, its name under.
    $rc = Rod-Card $f; $card = $rc.el; $live = $rc.live; $fw = $rc.w
  } else { $card = Fish-Card $f $fw @("$head $(if ($f.mark) { "$($f.mark) " })$($f.name)", "$($f.size)") $news }
  $card.Measure((New-Object Windows.Size 400, 400)); $cw = [Math]::Max($fw, $card.DesiredSize.Width)
  $bob = New-Object Windows.Media.TranslateTransform; $card.RenderTransform = $bob; $card.Opacity = 0
  $top = [Math]::Max(2, $sy - $at.size - $card.DesiredSize.Height - 2)
  Fx-Add $card ([Math]::Max(4, [Math]::Min($S.fxw.Width - $cw - 4, $cx - $cw / 2))) $top
  After 450 { param($a)
    Anim $a.card ([Windows.UIElement]::OpacityProperty) 0 1 250 0 $null
    $y = New-Object Windows.Media.Animation.DoubleAnimation; $y.From = 0; $y.To = -4; $y.Duration = New-Object Windows.Duration ([TimeSpan]::FromMilliseconds(420))
    $y.AutoReverse = $true; $y.RepeatBehavior = [Windows.Media.Animation.RepeatBehavior]::Forever; $a.bob.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, $y)
    for ($i = 0; $i -lt 6; $i++) { Fx-Go (Fx-Text '✨' (11 + $S.rnd.Next(5)) '#FFD666') ($a.cx - 30 + $S.rnd.Next(60)) ($a.top + 10 + $S.rnd.Next(20)) ($S.rnd.Next(-14, 15)) (-24 - $S.rnd.Next(16)) 1100 ($i * 420) }
  } @{ card = $card; bob = $bob; cx = $cx; top = $top }
  # Then down again: the card goes, the pet hops back to its place, the stage fades.
  # A podium stays up longer: three of them to look at.
  $hold = $(if ($place) { 7000 } else { $BRAG_MS })
  After $hold { param($a)
    Anim $a.card ([Windows.UIElement]::OpacityProperty) 1 0 250 0 $null
    $hop = New-Object Windows.Media.Animation.BackEase; $hop.Amplitude = 0.8; $hop.EasingMode = 'EaseIn'
    Anim $a.pos ([Windows.Media.TranslateTransform]::XProperty) $a.dx 0 450 150 $null
    Anim $a.pos ([Windows.Media.TranslateTransform]::YProperty) $a.dy 0 450 150 $hop
    Anim $a.el ([Windows.UIElement]::OpacityProperty) 1 0 300 450 $null
  } @{ card = $card; pos = $pos; dx = $dx; dy = $dy; el = $el }
  After ($hold + 650) { param($a)
    $S.fxc.Children.Remove($a.card); $S.fxc.Children.Remove($a.img); $S.fxc.Children.Remove($a.el)
    $a.m.img.Visibility = 'Visible'; $a.m.bragging = $false
    foreach ($p in @($a.live)) { $S.rodLive.Remove($p) }
  } @{ card = $card; img = $img; el = $el; m = $m; live = $live }
}
# 🎣 The rod shown off on the stage: its strip played big (about 155 px wide at the pets' size,
# more than five times the rod in the hand), its sky glowing behind from step 10, and a tag with
# its name and how many kinds the book has. The stills it plays come back to drop afterwards.
function Rod-Card($f) {
  $a = Rod-Art; $n = '{0:D2}' -f ([Math]::Max(0, [Math]::Min(14, [int]$f.rod)) + 1)
  $kind = $(if ($a) { $a.rods[[int]$n - 1] })
  $k = 0.62 * [Math]::Max(0.7, [Math]::Min(1.3, $S.k)); $wd = $a.w * $k; $ht = $a.h * $k
  $sp = New-Object Windows.Controls.StackPanel; $sp.IsHitTestVisible = $false
  $cv = New-Object Windows.Controls.Canvas; $cv.Width = $wd; $cv.Height = $ht; $cv.ClipToBounds = $false; $live = @()
  if ($kind -and $kind.sky) { $sk = Rod-Pics "sky-$n.png"; if ($sk) { $live += Rod-Pic $cv $sk $k 0 0 0 0 0 0.95 } }
  $pics = $(if ($kind) { Rod-Pics "rod-$n.png" })
  if ($pics) { $live += Rod-Pic $cv $pics $k 0 0 0 0 0 1 }
  [void]$sp.Children.Add($cv)
  $tag = New-Object Windows.Controls.Border; $tag.Background = $conv.ConvertFrom('#F01E1B2E'); $tag.CornerRadius = 10; $tag.Padding = New-Object Windows.Thickness 8, 2, 8, 3
  $tag.HorizontalAlignment = 'Center'; $tag.BorderBrush = $conv.ConvertFrom('#E0A83A'); $tag.BorderThickness = 1.2
  $tb = New-Object Windows.Controls.TextBlock; $tb.FontFamily = New-Object Windows.Media.FontFamily 'Malgun Gothic'; $tb.FontSize = 12; $tb.FontWeight = 'Bold'; $tb.Foreground = [Windows.Media.Brushes]::White
  $tb.Text = "🏆 $($f.name)$(if ($f.kinds) { " · 도감 $($f.kinds)종" })"; $tag.Child = $tb
  [void]$sp.Children.Add($tag)
  @{ el = $sp; live = $live; w = $wd }
}
# 💨 날리기: 💥 on the one hit, and a copy of them spins off in an arc, smaller and smaller,
# trailing sparkles — and they land back a moment later. On their own screen it is my pet that flies.
function Fly-Away($m, $at, $dir, $back = $false) {
  $img = New-Object Windows.Controls.Image; $img.Width = $at.size; $img.Height = $at.size; $img.Stretch = 'Fill'; $img.Source = $m.frames[0]; $img.IsHitTestVisible = $false
  [Windows.Media.RenderOptions]::SetBitmapScalingMode($img, 'NearestNeighbor')
  $sc = New-Object Windows.Media.ScaleTransform 1, 1; $rot = New-Object Windows.Media.RotateTransform 0; $mv = New-Object Windows.Media.TranslateTransform
  $tg = New-Object Windows.Media.TransformGroup; foreach ($t in $sc, $rot, $mv) { $tg.Children.Add($t) }; $img.RenderTransform = $tg; $img.RenderTransformOrigin = New-Object Windows.Point 0.5, 0.5
  Fx-Add $img ($at.x - $at.size / 2) ($at.foot - $at.size); $m.img.Visibility = 'Hidden'
  $dx = $dir * (260 + $S.rnd.Next(80)); $dy = -(220 + $S.rnd.Next(80)); $ease = New-Object Windows.Media.Animation.QuadraticEase; $ease.EasingMode = 'EaseOut'
  Anim $mv ([Windows.Media.TranslateTransform]::XProperty) 0 $dx 1400 0 $ease; Anim $mv ([Windows.Media.TranslateTransform]::YProperty) 0 $dy 1400 0 $ease
  Anim $rot ([Windows.Media.RotateTransform]::AngleProperty) 0 ($dir * 900) 1400 0 $null
  Anim $sc ([Windows.Media.ScaleTransform]::ScaleXProperty) 1 0.04 1400 0 $null; Anim $sc ([Windows.Media.ScaleTransform]::ScaleYProperty) 1 0.04 1400 0 $null
  Anim $img ([Windows.UIElement]::OpacityProperty) 1 0 400 1000 $null
  for ($i = 0; $i -lt 14; $i++) { $t = $i / 14.0; Fx-Go (Fx-Text '✨' (9 + $S.rnd.Next(6)) (Fx-Pick @('#FFD666', '#FFF4D6', '#7EE0C8'))) ($at.x + $dx * $t + $S.rnd.Next(-8, 9)) ($at.foot - $at.size / 2 + $dy * $t * (2 - $t) + $S.rnd.Next(-8, 9)) ($S.rnd.Next(-10, 11)) (-8 - $S.rnd.Next(12)) 500 ($i * 85) }
  Fx-Go (Fx-Text '✦' 16 '#FFF4D6') ($at.x + $dx - 8) ($at.foot - $at.size + $dy - 8) 0 -6 600 1350
  After 1500 { param($a) $S.fxc.Children.Remove($a.img); if ($a.back) { $a.m.img.Visibility = 'Visible'; Pop $a.m.col 0 18 } } @{ img = $img; m = $m; back = $back }
}
function Fling-Fx($key, $at, $data) {
  $kicker = $S.members[$key]; if (-not $kicker) { return }
  $mine = $data.who -and $data.who -eq $S.state.myId
  $tk = if ($mine) { '' } else { "$($kicker.floor)|$($data.who)" }; if (-not $S.members.Contains($tk)) { return }
  $target = $S.members[$tk]; if ($target -eq $kicker) { return }; $tat = Fx-At $target; $dir = if ($tat.x -ge $at.x) { 1 } else { -1 }
  if ([string]$data.how -eq 'hammer') { Fx-Go (Fx-Text '뿅!' 15 '#FF8FA3') ($tat.x + $dir * 10) ($tat.y - 26) ($dir * 18) -22 600 130 }
  Fx-Go (Fx-Text '💥' $(if ([string]$data.how -eq 'hammer') { 32 } else { 24 }) '#FFD666') ($tat.x - 12) ($tat.y - 6) 0 0 500 120
  After 130 { param($a) Fly-Away $a.m $a.at $a.dir $true; if ($a.mine) { After 1700 { param($b) Flinch; Say $S.members[''] '💨' "$($b.name) 님이 나를 날려 버렸어요!" 6 } @{ name = $a.kicker.name } } } @{ m = $target; at = $tat; dir = $dir; mine = $mine; kicker = $kicker }
}
# 🌧 /비 and ❄ /눈: weather over the whole row for a few seconds, and everyone in it puts up an
# umbrella, one after another with a little hop. Rain splashes off the umbrellas and leaves
# puddles at their feet; snow piles up on them and slides off when they close. /우산 while it
# falls twirls that umbrella (the drops fly off), and without weather just holds one up a moment.
$WX_MS = 5000
$S.wx = $null
# Each animal's own umbrella: its colour, what sticks up from the dome (ears, horns, a comb...)
# and what its face has besides two eyes and blushes (a beak, a snout). client/office.js has the same.
$UMB_KIND = @{
  cat = @('#F4A261', 'pointy'); dog = @('#C9A27E', 'floppy'); rabbit = @('#EFE9F4', 'long'); chick = @('#F6D365', 'tuft', 'beak')
  penguin = @('#4A4E69', '', 'beak'); hamster = @('#E9B87A', 'round'); fox = @('#E07A5F', 'pointy'); bear = @('#9C6B4E', 'round')
  panda = @('#F2F2F2', 'round'); frog = @('#81B29A', 'frog'); pig = @('#F4B6C2', 'pointy', 'snout'); mouse = @('#B8B8C8', 'big')
  parrot = @('#6BCB77', 'tuft', 'beak'); owl = @('#A0785A', 'pointy', 'beak'); hedgehog = @('#9C7A5B', 'spikes'); duck = @('#F7E07E', 'tuft', 'beak')
  tiger = @('#F4A261', 'pointy'); ox = @('#D9CBB8', 'horns'); snake = @('#7FB77E', ''); horse = @('#A47551', 'pointy')
  sheep = @('#F5F0E6', 'floppy'); monkey = @('#B07D56', 'side'); rooster = @('#F2E9DC', 'comb', 'beak'); shark = @('#7D9DB5', 'fin'); dragon = @('#6FB98F', 'horns')
  mochi = @('#FFFFFF', 'round'); bluecat = @('#FFFFFF', 'pointy', '', '#6F9CC6', '#6F9CC6'); lemonbun = @('#F6E3A6', 'long')
  otter = @('#A9744F', 'round'); seal = @('#D5DEE8', ''); ghost = @('#FFFFFF', ''); sprout = @('#D8F2B0', 'tuft'); unicorn = @('#FFFFFF', 'horn', '', '#FFFFFF', '#B39DDB'); capybara = @('#C9925E', 'round'); axolotl = @('#FFC2D4', 'gills')
}
function Shade($hex, $f) { $c = [Windows.Media.ColorConverter]::ConvertFromString($hex); '#{0:X2}{1:X2}{2:X2}' -f [int]($c.R * $f), [int]($c.G * $f), [int]($c.B * $f) }
# An animal's umbrella $wd wide, leaning a little towards its pet: a low dome of four panels,
# every other one in shade, a scalloped hem, the animal's ears (or horns...) and face, a crook
# handle. The canopy opens and closes sideways; snow gathers on it as lumps along the dome.
function Umbrella($wd, $kind) {
  $spec = $UMB_KIND[$kind]; if (-not $spec) { $spec = @('#C3B1E1', 'pointy') }
  $color = $spec[0]; $style = $spec[1]; $nose = $spec[2]
  # For one whose ears are not the dome's colour: the ears' colour, and a cap of colour on the dome's top.
  $earFill = $(if ($spec.Count -gt 3) { $spec[3] } else { $color }); $capFill = $(if ($spec.Count -gt 4) { $spec[4] })
  # The rice-cake friends' umbrellas are their own faces: a dark line round the dome, tall eyes, big blushes, a v mouth.
  $softKind = $kind -in 'mochi', 'bluecat', 'lemonbun', 'otter', 'seal', 'ghost', 'sprout', 'unicorn', 'capybara', 'axolotl'
  $r = $wd / 2; $h = [Math]::Round($wd * 0.34, 1); $hl = [Math]::Round($h + $wd * 0.55, 1); $dip = 5
  # A point on the dome at $deg (0 = right, 90 = top), $out further out.
  $dp = { param($deg, $out) $a = $deg * [Math]::PI / 180; New-Object Windows.Point ($r + ($r + $out) * [Math]::Cos($a)), ($h - ($h + $out) * [Math]::Sin($a)) }
  $poly = { param($fill, $pts) $pg = New-Object Windows.Shapes.Polygon; $pg.Fill = $conv.ConvertFrom($fill); $pg.Points = New-Object Windows.Media.PointCollection; foreach ($q in $pts) { $pg.Points.Add($q) }; $pg }
  $oval = { param($fill, $cx, $cy, $rx, $ry, $ang = 0)
    $e = New-Object Windows.Shapes.Ellipse; $e.Width = 2 * $rx; $e.Height = 2 * $ry; $e.Fill = $conv.ConvertFrom($fill)
    [Windows.Controls.Canvas]::SetLeft($e, $cx - $rx); [Windows.Controls.Canvas]::SetTop($e, $cy - $ry)
    if ($ang) { $e.RenderTransformOrigin = New-Object Windows.Point 0.5, 0.5; $e.RenderTransform = New-Object Windows.Media.RotateTransform $ang }; $e }
  $box = New-Object Windows.Controls.Canvas; $box.IsHitTestVisible = $false; $box.Width = $wd; $box.Height = $hl + 4
  $box.RenderTransformOrigin = New-Object Windows.Point 0.5, 1; $box.RenderTransform = New-Object Windows.Media.RotateTransform -9
  $hd = New-Object Windows.Shapes.Path; $hd.Stroke = $conv.ConvertFrom('#A89DBE'); $hd.StrokeThickness = 1.8; $hd.StrokeStartLineCap = 'Round'; $hd.StrokeEndLineCap = 'Round'
  $hd.Data = [Windows.Media.Geometry]::Parse("M $r,$h L $r,$hl A 3.5,3.5 0 0 1 $($r - 7),$hl"); [void]$box.Children.Add($hd)
  $top = New-Object Windows.Controls.Canvas; $top.Width = $wd; $top.Height = $h; $top.RenderTransformOrigin = New-Object Windows.Point 0.5, 1
  $sc = New-Object Windows.Media.ScaleTransform 1, 1; $top.RenderTransform = $sc
  $add = { param($el) [void]$top.Children.Add($el) }
  $pink = '#F2B5B5'; $dark = Shade $color 0.78
  # Behind the dome: what sticks up from it.
  foreach ($sd in 1, -1) {
    switch ($style) {
      'pointy' { $m0 = 90 + $sd * 28
        & $add (& $poly $earFill @((& $dp ($m0 + 13) 0), (& $dp ($m0 - 13) 0), (& $dp $m0 ($r * 0.34))))
        & $add (& $poly $pink @((& $dp ($m0 + 8) 1), (& $dp ($m0 - 8) 1), (& $dp $m0 ($r * 0.22)))) }
      { $_ -in 'round', 'big' } { $p0 = & $dp (90 + $sd * 30) ($r * 0.05); $er = $r * $(if ($style -eq 'big') { 0.27 } else { 0.2 })
        & $add (& $oval $(if ($kind -eq 'panda') { '#2E2E2E' } else { $color }) $p0.X $p0.Y $er $er)
        if ($kind -ne 'panda') { & $add (& $oval $pink $p0.X $p0.Y ($er * 0.55) ($er * 0.55)) } }
      'long' { $p0 = & $dp (90 + $sd * 16) ($r * 0.42)
        & $add (& $oval $color $p0.X $p0.Y ($r * 0.12) ($r * 0.42) (-$sd * 12)); & $add (& $oval $pink $p0.X ($p0.Y + 2) ($r * 0.055) ($r * 0.3) (-$sd * 12)) }
      'horns' { $m0 = 90 + $sd * 28; & $add (& $poly '#F2E3C6' @((& $dp ($m0 + 7) 0), (& $dp ($m0 - 7) 0), (& $dp ($m0 - $sd * 4) ($r * 0.42)))) }
      'frog' { $p0 = & $dp (90 + $sd * 25) ($r * 0.04); & $add (& $oval $color $p0.X $p0.Y ($r * 0.17) ($r * 0.17)) }
    }
  }
  switch ($style) {
    'horn' { & $add (& $poly '#FFD166' @((& $dp 98 0), (& $dp 82 0), (& $dp 90 ($r * 0.5)))) }
    'tuft' { foreach ($j in -1, 0, 1) { $p0 = & $dp (90 - $j * 7) ($r * 0.12); & $add (& $oval $dark $p0.X $p0.Y ($r * 0.05) ($r * 0.16) ($j * 25)) } }
    'comb' { foreach ($j in -1, 0, 1) { $p0 = & $dp (90 - $j * 9) ($r * 0.06); & $add (& $oval '#E05A47' $p0.X $p0.Y ($r * 0.1) ($r * 0.1)) } }
    'spikes' { for ($deg = 160; $deg -ge 20; $deg -= 20) { & $add (& $poly '#7A5C43' @((& $dp ($deg + 7) 0), (& $dp ($deg - 7) 0), (& $dp $deg ($r * 0.2)))) } }
    'fin' { & $add (& $poly $dark @((& $dp 106 0), (& $dp 80 0), (& $dp 100 ($r * 0.5)))) }
  }
  $xs = 0..4 | ForEach-Object { $_ * $wd / 4 }
  $hem = (4..1 | ForEach-Object { "Q $(($xs[$_] + $xs[$_ - 1]) / 2),$($h - $dip) $($xs[$_ - 1]),$h" }) -join ' '
  $cv = New-Object Windows.Shapes.Path; $cv.Fill = $conv.ConvertFrom($color); $cv.Stroke = $conv.ConvertFrom($(if ($softKind) { '#D92A2426' } else { '#38000000' })); $cv.StrokeThickness = $(if ($softKind) { 1.4 } else { 1 })
  $cv.Data = [Windows.Media.Geometry]::Parse("M 0,$h A $r,$h 0 0 1 $wd,$h $hem Z"); & $add $cv
  if ($capFill) { $capA = & $dp 125 0; $capB = & $dp 55 0; $capPath = New-Object Windows.Shapes.Path; $capPath.Fill = $conv.ConvertFrom($capFill)
    $capPath.Data = [Windows.Media.Geometry]::Parse("M $($capA.X),$($capA.Y) A $r,$h 0 0 1 $($capB.X),$($capB.Y) Z"); & $add $capPath }
  foreach ($i in 1, 3) {
    $sh = New-Object Windows.Shapes.Path; $sh.Fill = $conv.ConvertFrom($(if ($softKind) { '#0D000000' } else { '#1E000000' }))
    $sh.Data = [Windows.Media.Geometry]::Parse("M $r,0.5 L $($xs[$i]),$h Q $(($xs[$i] + $xs[$i + 1]) / 2),$($h - $dip) $($xs[$i + 1]),$h Z"); & $add $sh
  }
  # In front of the dome: hanging ears, and the face.
  foreach ($sd in 1, -1) {
    if ($style -eq 'floppy') { & $add (& $oval $dark ($r - $sd * $r * 0.92) ($h * 0.78) ($r * 0.13) ($r * 0.3) ($sd * 20)) }
    if ($style -eq 'side') { & $add (& $oval $color ($r - $sd * $r * 1.0) ($h * 0.6) ($r * 0.17) ($r * 0.17)); & $add (& $oval '#E8C9A5' ($r - $sd * $r * 1.0) ($h * 0.6) ($r * 0.1) ($r * 0.1)) }
    if ($style -eq 'gills') { foreach ($j in -1, 0, 1) { & $add (& $oval '#FF6F91' ($r - $sd * $r * 1.04) ($h * (0.56 + $j * 0.2)) ($r * 0.16) ($r * 0.05) ($sd * $j * 22)) } }
    if ($style -eq 'frog') { $p0 = & $dp (90 + $sd * 25) ($r * 0.04); & $add (& $oval '#FFFFFF' $p0.X $p0.Y ($r * 0.1) ($r * 0.1)); & $add (& $oval '#3A3045' $p0.X $p0.Y ($r * 0.05) ($r * 0.05)) }
    else {
      $ex = $r - $sd * $r * 0.2; $ey = $h * 0.56
      if ($kind -eq 'panda') { & $add (& $oval '#3A3A3A' $ex $ey ($r * 0.1) ($r * 0.075) ($sd * 25)) }
      $eye = [Math]::Max(1.3, $r * 0.055); & $add (& $oval $(if ($softKind) { '#1C1718' } elseif ($kind -eq 'panda' -or $kind -eq 'penguin') { '#FFFFFF' } else { '#3A3045' }) $ex $ey $eye $(if ($softKind) { $eye * 1.6 } else { $eye }))
    }
    & $add (& $oval $(if ($softKind) { '#D9F7A8B8' } else { '#55F28482' }) ($r - $sd * $r * 0.36) ($h * 0.74) ($r * $(if ($softKind) { 0.11 } else { 0.08 })) ($r * $(if ($softKind) { 0.06 } else { 0.045 })))
  }
  switch ($nose) {
    'beak' { & $add (& $poly '#F2A541' @((New-Object Windows.Point ($r - $r * 0.07), ($h * 0.64)), (New-Object Windows.Point ($r + $r * 0.07), ($h * 0.64)), (New-Object Windows.Point $r, ($h * 0.78)))) }
    'snout' { & $add (& $oval '#E89AAB' $r ($h * 0.72) ($r * 0.11) ($r * 0.075)); foreach ($sd in 1, -1) { & $add (& $oval '#9C5B6B' ($r - $sd * $r * 0.04) ($h * 0.72) 1 1) } }
    default {
      if ($softKind) { $mouth = New-Object Windows.Shapes.Polyline; $mouth.Stroke = $conv.ConvertFrom('#2A2426'); $mouth.StrokeThickness = [Math]::Max(1, $r * 0.03); $mouth.StrokeLineJoin = 'Round'; $mouth.StrokeStartLineCap = 'Round'; $mouth.StrokeEndLineCap = 'Round'
        $mouth.Points = New-Object Windows.Media.PointCollection; foreach ($q in @((New-Object Windows.Point ($r - $r * 0.06), ($h * 0.67)), (New-Object Windows.Point $r, ($h * 0.76)), (New-Object Windows.Point ($r + $r * 0.06), ($h * 0.67)))) { $mouth.Points.Add($q) }; & $add $mouth }
      elseif ($style -ne 'frog') { & $add (& $oval '#3A3045' $r ($h * 0.68) ($r * 0.035) ($r * 0.028)) } }
  }
  [void]$box.Children.Add($top)
  # Lumps of snow sitting on the dome, bigger towards the top; apart from the canopy, so they
  # slide off on their own when it closes.
  $pile = New-Object Windows.Controls.Canvas; $blobs = New-Object Collections.ArrayList
  for ($k = 0; $k -lt 7; $k++) {
    $th = [Math]::PI * (0.86 - $k * 0.12); $d = 5 + 3 * [Math]::Sin($th) + $S.rnd.Next(3)
    $px = $r + $r * 0.9 * [Math]::Cos($th); $py = $h - $h * [Math]::Sin($th)
    $b = New-Object Windows.Shapes.Ellipse; $b.Width = $d; $b.Height = $d * 0.8; $b.Fill = $conv.ConvertFrom('#F4F7FD'); $b.Stroke = $conv.ConvertFrom('#1E000000'); $b.StrokeThickness = 0.6
    $bs = New-Object Windows.Media.ScaleTransform 0, 0; $b.RenderTransformOrigin = New-Object Windows.Point 0.5, 1; $b.RenderTransform = $bs
    [Windows.Controls.Canvas]::SetLeft($b, $px - $d / 2); [Windows.Controls.Canvas]::SetTop($b, $py - $d * 0.65)
    [void]$pile.Children.Add($b); [void]$blobs.Add($bs)
  }
  [void]$box.Children.Add($pile)
  @{ el = $box; sc = $sc; canopy = $cv; pile = $pile; blobs = $blobs; wd = $wd; h = $h; ci = 0; piling = $false; puddle = $null }
}
function Umb-Open($m, $at, $n) {
  $u = Umbrella ($at.size * 1.45) $m.kind
  $u.el.Opacity = 0; $u.sc.ScaleX = 0.1; Umb-Place $u $at; [void]$S.fxc.Children.Add($u.el)
  $delay = ($n % 6) * 150; $back = New-Object Windows.Media.Animation.BackEase; $back.Amplitude = 0.6
  Anim $u.el ([Windows.UIElement]::OpacityProperty) 0 1 150 $delay $null
  Anim $u.sc ([Windows.Media.ScaleTransform]::ScaleXProperty) 0.1 1 380 $delay $back
  # A little hop as it goes up.
  $t = New-Object Windows.Media.TranslateTransform; $m.g.RenderTransform = $t
  Anim $t ([Windows.Media.TranslateTransform]::YProperty) 0 -10 150 $delay $null
  After ($delay + 160) { param($t) Anim $t ([Windows.Media.TranslateTransform]::YProperty) -10 0 220 0 $null } $t
  $u
}
# Held a little to the side, the canopy just over the head; the puddle under the feet.
function Umb-Place($u, $at) {
  [Windows.Controls.Canvas]::SetLeft($u.el, $at.x - $u.wd / 2 + $at.size * 0.22); [Windows.Controls.Canvas]::SetTop($u.el, $at.y - $u.h + $at.size * 0.08)
  if ($u.puddle) { [Windows.Controls.Canvas]::SetLeft($u.puddle, $at.x - $u.puddle.Width / 2); [Windows.Controls.Canvas]::SetTop($u.puddle, $at.foot - 3) }
}
# /우산 under the weather: a twirl (the canopy flips round and back) and the drops fly off it.
function Umb-Twirl($u) {
  Anim $u.sc ([Windows.Media.ScaleTransform]::ScaleXProperty) 1 -1 200 0 $null
  After 210 { param($u) Anim $u.sc ([Windows.Media.ScaleTransform]::ScaleXProperty) -1 1 200 0 $null } $u
  $x0 = [Windows.Controls.Canvas]::GetLeft($u.el) + $u.wd / 2; $y0 = [Windows.Controls.Canvas]::GetTop($u.el) + $u.h * 0.8
  for ($i = 0; $i -lt 8; $i++) {
    $a = $i / 8 * 2 * [Math]::PI; $d = New-Object Windows.Shapes.Ellipse; $d.Width = 3; $d.Height = 3; $d.Fill = $conv.ConvertFrom('#C8DAF0')
    Fx-Go $d ($x0 + [Math]::Cos($a) * $u.wd / 2) $y0 ([Math]::Cos($a) * 16) ([Math]::Sin($a) * 6 + 10) 450 120
  }
}
function Start-Wx($kind, $key) {
  $wx = $S.wx; $now = Get-Date
  if ($wx -and $wx.closing) { After 900 { param($a) Play-Fx $a[0] $a[1] } @($kind, $key); return }
  if ($kind -eq 'umbrella') {
    if ($wx -and $wx.umb.Contains($key)) { Umb-Twirl $wx.umb[$key]; return }
    if (-not $wx) { $wx = @{ kind = 'none'; until = $now; umb = @{}; solo = @{}; closing = $false; n = 0 }; $S.wx = $wx }
    $wx.solo[$key] = 1; if ($wx.kind -eq 'none' -and $now.AddMilliseconds(3000) -gt $wx.until) { $wx.until = $now.AddMilliseconds(3000) }
    return
  }
  if (-not $wx) { $wx = @{ kind = $kind; until = $now; umb = @{}; solo = @{}; closing = $false; n = 0 }; $S.wx = $wx }
  $wx.kind = $kind; $wx.until = $now.AddMilliseconds($WX_MS)
}
# Every animation tick while there is weather: umbrellas for whoever has none yet (and kept over
# their pets as the row changes), the falling rain or snow, splashes, the snow piling up.
function Wx-Tick {
  $wx = $S.wx; if (-not $wx -or $wx.closing -or -not $S.fxw -or -not $w.IsVisible) { return }
  if ((Get-Date) -gt $wx.until) { Wx-End $wx; return }
  $f = $S.fxw; $f.Left = $w.Left; $f.Top = $w.Top - $FX_ROOM; $f.Width = [Math]::Max(1, $w.ActualWidth); $f.Height = $w.ActualHeight + $FX_ROOM
  $floorY = 0
  foreach ($k in @($S.members.Keys)) {
    $m = $S.members[$k]; if (-not $m.img.ActualWidth) { continue }
    if ($wx.kind -eq 'none' -and -not $wx.solo.Contains($k)) { continue }
    $at = Fx-At $m; if ($at.foot -gt $floorY) { $floorY = $at.foot }
    $u = $wx.umb[$k]
    if (-not $u) { $u = Umb-Open $m $at $wx.n; $wx.umb[$k] = $u; $wx.n++ }
    $u.el.Visibility = if ($m.img.Visibility -eq 'Visible') { 'Visible' } else { 'Hidden' }
    if ($wx.kind -eq 'snow' -and -not $u.piling) {
      # One lump after another, in no particular order, each settling in with a small bounce.
      $u.piling = $true; $back = New-Object Windows.Media.Animation.BackEase; $back.Amplitude = 0.5
      foreach ($bs in $u.blobs) { $at0 = 400 + $S.rnd.Next(3200)
        Anim $bs ([Windows.Media.ScaleTransform]::ScaleXProperty) 0 1 600 $at0 $back; Anim $bs ([Windows.Media.ScaleTransform]::ScaleYProperty) 0 1 600 $at0 $back }
    }
    if ($wx.kind -eq 'rain' -and -not $u.puddle) {
      $p = New-Object Windows.Shapes.Ellipse; $p.Width = $at.size * 0.95; $p.Height = 5; $p.Fill = $conv.ConvertFrom('#557FA8C9'); $p.IsHitTestVisible = $false
      $u.puddle = $p; $S.fxc.Children.Insert(0, $p); Anim $p ([Windows.UIElement]::OpacityProperty) 0 1 1800 500 $null
    }
    Umb-Place $u $at
    if ($wx.kind -eq 'rain' -and $u.el.Visibility -eq 'Visible' -and $S.rnd.Next(2) -eq 0) {
      $ux = [Windows.Controls.Canvas]::GetLeft($u.el) + $S.rnd.Next([int]$u.wd); $uy = [Windows.Controls.Canvas]::GetTop($u.el) + 2
      $d = New-Object Windows.Shapes.Ellipse; $d.Width = 2; $d.Height = 2; $d.Fill = $conv.ConvertFrom('#C8DAF0')
      Fx-Go $d $ux $uy ($S.rnd.Next(-7, 8)) -5 260 0
    }
  }
  if (-not $floorY) { return }
  $wd = [int]$S.fxw.Width
  if ($wx.kind -eq 'rain') {
    for ($i = 0; $i -lt 7; $i++) {
      $y0 = $S.rnd.Next(30); $ln = New-Object Windows.Shapes.Line; $ln.X1 = 0; $ln.Y1 = 0; $ln.X2 = -2; $ln.Y2 = 9; $ln.Stroke = $conv.ConvertFrom('#99B4C8E8'); $ln.StrokeThickness = 1.2
      Fx-Go $ln ($S.rnd.Next($wd + 20)) $y0 -12 ($floorY - $y0 - 6) (520 + $S.rnd.Next(160)) ($S.rnd.Next(200))
    }
  } elseif ($wx.kind -eq 'snow') {
    for ($i = 0; $i -lt 2; $i++) { $y0 = $S.rnd.Next(30); Fx-Go (Fx-Text '❄' (9 + $S.rnd.Next(5)) '#DDE6F5') ($S.rnd.Next($wd)) $y0 ($S.rnd.Next(-20, 21)) ($floorY - $y0 - 8) (2400 + $S.rnd.Next(800)) ($S.rnd.Next(200)) }
  }
}
# The weather stops: the umbrellas close (their snow slides off), the puddles dry up.
function Wx-End($wx) {
  $wx.closing = $true
  foreach ($u in @($wx.umb.Values)) {
    Anim $u.sc ([Windows.Media.ScaleTransform]::ScaleXProperty) 1 0.1 300 0 $null
    Anim $u.el ([Windows.UIElement]::OpacityProperty) 1 0 250 250 $null
    if ($u.piling) { $pt = New-Object Windows.Media.TranslateTransform; $u.pile.RenderTransform = $pt
      Anim $pt ([Windows.Media.TranslateTransform]::YProperty) 0 16 320 0 $null; Anim $u.pile ([Windows.UIElement]::OpacityProperty) 1 0 320 0 $null }
    if ($u.puddle) { Anim $u.puddle ([Windows.UIElement]::OpacityProperty) 1 0 600 0 $null }
  }
  After 700 { param($wx)
    foreach ($u in @($wx.umb.Values)) { $S.fxc.Children.Remove($u.el); if ($u.puddle) { $S.fxc.Children.Remove($u.puddle) } }
    if ($S.wx -eq $wx) { $S.wx = $null }
  } $wx
}
# 💃 /춤: a little stage comes up over the row, the dancer's stand-in hops onto it, dances for a
# few seconds and hops back while the pet in the row waits out of sight. Whoever dances while the
# stage is up joins in beside them, and the more there are, the more notes fly.
function Stage-Draw {
  $sg = $S.stage; $sg.el.Children.Clear()
  $wd = 24 + [Math]::Max(1, $sg.dancers.Count) * $sg.unit; $left = $sg.cx - $wd / 2
  foreach ($side in -1, 1) {
    $lx = $sg.cx + $side * ($wd / 2 + 8); $ly = $sg.y - $sg.unit * 1.7
    $beam = New-Object Windows.Shapes.Polygon; $beam.Fill = $conv.ConvertFrom($(if ($side -lt 0) { '#22FFE8A3' } else { '#227EE0C8' }))
    $beam.Points = New-Object Windows.Media.PointCollection
    foreach ($p in @(@($lx, $ly), @(($sg.cx - $side * $wd / 4), $sg.y), @(($sg.cx + $side * $wd / 2), $sg.y))) { $beam.Points.Add((New-Object Windows.Point $p[0], $p[1])) }
    [void]$sg.el.Children.Add($beam)
    $bulb = New-Object Windows.Shapes.Ellipse; $bulb.Width = 7; $bulb.Height = 7; $bulb.Fill = $conv.ConvertFrom($(if ($side -lt 0) { '#FFE8A3' } else { '#7EE0C8' }))
    [Windows.Controls.Canvas]::SetLeft($bulb, $lx - 3.5); [Windows.Controls.Canvas]::SetTop($bulb, $ly - 3.5); [void]$sg.el.Children.Add($bulb)
  }
  $board = New-Object Windows.Controls.Border; $board.Width = $wd; $board.Height = 8; $board.CornerRadius = 4
  $board.Background = $conv.ConvertFrom('#3B355A'); $board.BorderBrush = $conv.ConvertFrom('#5E5486'); $board.BorderThickness = 1
  [Windows.Controls.Canvas]::SetLeft($board, $left); [Windows.Controls.Canvas]::SetTop($board, $sg.y); [void]$sg.el.Children.Add($board)
}
function Dance($key, $at) {
  $m = $S.members[$key]; $sg = $S.stage
  if ($sg -and $sg.ending) { After 900 { param($k) Play-Fx 'dance' $k } $key; return }
  $later = (Get-Date).AddMilliseconds(3200)
  if ($sg -and @($sg.dancers | Where-Object { $_.key -eq $key }).Count) { if ($later -gt $sg.until) { $sg.until = $later }; return }
  if (-not $sg) {
    $ref = Fx-At $S.members['']; $unit = [Math]::Max(30, $at.size) + 8
    $el = New-Object Windows.Controls.Canvas; $S.fxc.Children.Insert(0, $el)
    $sg = @{ el = $el; cx = [Math]::Max($unit * 1.5, [Math]::Min($S.fxw.Width - $unit * 1.5, $at.x)); y = $ref.y - 32; unit = $unit
      dancers = New-Object Collections.ArrayList; until = (Get-Date).AddMilliseconds($DANCE_MS); ending = $false }
    $S.stage = $sg
    Anim $el ([Windows.UIElement]::OpacityProperty) 0 1 250 0 $null
  } elseif ($later -gt $sg.until) { $sg.until = $later }
  $off = @(0, -1, 1, -2, 2, -3, 3)[[Math]::Min($sg.dancers.Count, 6)]
  $img = New-Object Windows.Controls.Image; $img.Width = $at.size; $img.Height = $at.size; $img.Stretch = 'Fill'; $img.Source = $m.frames[0]
  [Windows.Media.RenderOptions]::SetBitmapScalingMode($img, 'NearestNeighbor')
  $sc = New-Object Windows.Media.ScaleTransform 1, 1; $rot = New-Object Windows.Media.RotateTransform 0; $bob = New-Object Windows.Media.TranslateTransform; $pos = New-Object Windows.Media.TranslateTransform
  $tg = New-Object Windows.Media.TransformGroup; foreach ($t in $sc, $rot, $bob, $pos) { $tg.Children.Add($t) }
  $img.RenderTransform = $tg; $img.RenderTransformOrigin = New-Object Windows.Point 0.5, 1
  Fx-Add $img ($at.x - $at.size / 2) ($at.foot - $at.size)
  $d = @{ key = $key; img = $img; frames = $m.frames; sc = $sc; rot = $rot; bob = $bob; pos = $pos; size = $at.size
    dx = $sg.cx + $off * $sg.unit - $at.x; dy = $sg.y - $at.foot; cx = $sg.cx + $off * $sg.unit; at = (Get-Date); grooving = $false; spun = $false }
  [void]$sg.dancers.Add($d); Stage-Draw
  $m.img.Visibility = 'Hidden'
  $hop = New-Object Windows.Media.Animation.BackEase; $hop.Amplitude = 0.8
  Anim $pos ([Windows.Media.TranslateTransform]::XProperty) 0 $d.dx 500 0 $null
  Anim $pos ([Windows.Media.TranslateTransform]::YProperty) 0 $d.dy 500 0 $hop
  After 520 { param($d) if (-not $S.stage -or $S.stage.ending) { return }; Groove $d } $d
}
function Groove($d) {
  $x = New-Object Windows.Media.Animation.DoubleAnimation; $x.From = -14; $x.To = 14; $x.Duration = New-Object Windows.Duration ([TimeSpan]::FromMilliseconds(300))
  $x.AutoReverse = $true; $x.RepeatBehavior = [Windows.Media.Animation.RepeatBehavior]::Forever
  $d.rot.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, $x)
  $y = New-Object Windows.Media.Animation.DoubleAnimation; $y.From = 0; $y.To = -7; $y.Duration = New-Object Windows.Duration ([TimeSpan]::FromMilliseconds(150))
  $y.AutoReverse = $true; $y.RepeatBehavior = [Windows.Media.Animation.RepeatBehavior]::Forever
  $d.bob.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, $y)
  $d.grooving = $true
}
# Every animation tick (0.2 s) while the stage is up: steps, turns, one spin each, the notes.
function Fx-Tick {
  $sg = $S.stage; if (-not $sg) { return }
  $now = Get-Date
  foreach ($d in @($sg.dancers)) {
    $hm = $S.members[$d.key]; if ($hm -and -not $sg.ending) { $hm.img.Visibility = 'Hidden' }
    $d.img.Source = $d.frames[@(0, 1, 3, 1)[$S.tick % 4]]
    if ($sg.ending) { continue }
    if ($d.grooving -and $S.tick % 2 -eq 0) { $d.sc.ScaleX = -$d.sc.ScaleX }
    if ($d.grooving -and -not $d.spun -and ($now - $d.at).TotalMilliseconds -gt 2000) {
      $d.spun = $true; $d.grooving = $false; $d.sc.ScaleX = 1
      Anim $d.rot ([Windows.Media.RotateTransform]::AngleProperty) 0 360 500 0 $null
      After 520 { param($d) if ($S.stage -and -not $S.stage.ending) { Groove $d } } $d
    }
    if ($S.rnd.Next(3) -eq 0) { Fx-Go (Fx-Text (Fx-Pick @('♪', '♫')) 13 (Fx-Pick $FX_COLORS)) ($d.cx - 5 + $S.rnd.Next(-12, 13)) ($sg.y - $d.size - 12) ($S.rnd.Next(-12, 13)) -45 1200 0 }
  }
  if (-not $sg.ending -and $sg.dancers.Count -gt 1) { for ($i = 1; $i -lt $sg.dancers.Count; $i++) { if ($S.rnd.Next(2) -eq 0) { Fx-Go (Fx-Text (Fx-Pick @('♪', '♫', '♬')) (12 + $S.rnd.Next(5)) (Fx-Pick $FX_COLORS)) ($sg.cx + $S.rnd.Next(-50, 51)) ($sg.y - $sg.unit * 1.6) ($S.rnd.Next(-15, 16)) -40 1300 0 } } }
  if (-not $sg.ending -and $now -gt $sg.until) { Stage-Down $sg }
}
function Stage-Down($sg) {
  $sg.ending = $true
  foreach ($d in @($sg.dancers)) {
    $d.rot.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, $null); $d.bob.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, $null); $d.sc.ScaleX = 1
    $hop = New-Object Windows.Media.Animation.BackEase; $hop.Amplitude = 0.8; $hop.EasingMode = 'EaseIn'
    Anim $d.pos ([Windows.Media.TranslateTransform]::XProperty) $d.dx 0 450 0 $null
    Anim $d.pos ([Windows.Media.TranslateTransform]::YProperty) $d.dy 0 450 0 $hop
  }
  Anim $sg.el ([Windows.UIElement]::OpacityProperty) 1 0 300 300 $null
  After 470 { param($sg)
    foreach ($d in @($sg.dancers)) { $S.fxc.Children.Remove($d.img); $hm = $S.members[$d.key]; if ($hm) { $hm.img.Visibility = 'Visible' } }
  } $sg
  After 650 { param($sg) $S.fxc.Children.Remove($sg.el); if ($S.stage -eq $sg) { $S.stage = $null } } $sg
}
# ⛄ /눈사람: everyone on the row turns at once into a snowman — a pixel snowman in the pets' own
# style (scripts/make-snowmen.js draws one per kind into client/assets/snowmen, 36 x 60), the same
# snowman for all, each animal known by what it has on in its own colours (a hat with its ears or
# horns, a beak, a tail, a thing in its hand). Snow swirls in and it pops up; it stands SNOW_MS
# (as long as the rain) with snow falling on it, doing its animal's little thing; then it melts
# into a puddle with a puff of steam and the pet pops back. The dragon breathes fire and melts
# first; the penguin likes it, jumps for joy while the others melt and stays a little longer.
# Another /눈사람 meanwhile keeps them standing; whoever comes onto the row meanwhile turns too.
# Everything that flies (fire, words, snow) goes toward the middle of the window, so nothing is
# cut off at its edge (the pets sit at its right end).
$SNOW_MS = 5000
$SNOW_LATE = @{ dragon = -1800; penguin = 1500 } # melts this much before (−) or after the rest
$SNOW_PX = 24 # the snowman's pixels per pet size: its body about as wide as the pet
$S.snow = $null; $S.snowPics = @{}; $S.frozen = @{}
function Snow-Pic($kind) {
  if (-not $S.snowPics.ContainsKey($kind)) {
    $f = Join-Path (Join-Path (Split-Path $pets) 'snowmen') "$kind.png"
    $S.snowPics[$kind] = $(try { $bi = New-Object Windows.Media.Imaging.BitmapImage; $bi.BeginInit(); $bi.UriSource = [Uri]$f; $bi.CacheOption = 'OnLoad'; $bi.EndInit(); $bi.Freeze(); $bi } catch { $null })
  }
  $S.snowPics[$kind]
}
function Snow-In($x) { $(if ($S.fxw -and $x -gt $S.fxw.Width / 2) { -1 } else { 1 }) } # toward the middle
function Snow-Dot($d, $color, $line = $null) { $e = New-Object Windows.Shapes.Ellipse; $e.Width = $d; $e.Height = $d; $e.Fill = $conv.ConvertFrom($color); if ($line) { $e.Stroke = $conv.ConvertFrom($line); $e.StrokeThickness = 0.8 }; $e }
# A soft cloud of snow: white puffs that spread and fade.
function Snow-Puff($x, $y, $n, $spread, $delay = 0) {
  for ($i = 0; $i -lt $n; $i++) { $an = $i / $n * 2 * [Math]::PI + $S.rnd.NextDouble() * 0.5; $d = 6 + $S.rnd.Next(7)
    Fx-Go (Snow-Dot $d '#F2F8FF' '#C9D6E8') ($x - $d / 2) ($y - $d / 2) ([Math]::Cos($an) * $spread) ([Math]::Sin($an) * $spread * 0.5 - 6) (500 + $S.rnd.Next(250)) $delay }
}
function Snow-Spark($x, $y, $n, $delay = 0) {
  for ($i = 0; $i -lt $n; $i++) { Fx-Go (Fx-Text (Fx-Pick @('✦', '✧', '❄')) (9 + $S.rnd.Next(6)) (Fx-Pick @('#FFFFFF', '#CFEFFF', '#FFF6C8'))) ($x + $S.rnd.Next(-22, 23)) ($y + $S.rnd.Next(-14, 10)) ($S.rnd.Next(-8, 9)) (-14 - $S.rnd.Next(14)) 700 ($delay + $i * 90) }
}
function Snow-Say($sm, $text, $color) {
  $t = Fx-Text $text 14 $color; $t.FontFamily = New-Object Windows.Media.FontFamily 'Malgun Gothic'
  $dir = Snow-In $sm.x; $tx = $(if ($dir -lt 0) { $sm.x - 54 } else { $sm.x + 8 })
  Fx-Go $t $tx ($sm.foot - $sm.ht - 4) ($dir * 8) -24 1200 0
}
# ── Each animal's own thing, once, a moment after it stands (/눈사람 or a snowball) ──
# Parts drawn apart by make-snowmen.js (PARTS) move on their own: where each turns about, in the
# snowman picture's pixels. Small things that come and go (fx-yarn, fx-fly) are its pictures too.
$SNOW_PARTS = @{ cat = @{ tail = @(28, 51) }; dog = @{ tail = @(28, 48); bone = @(33, 21) }; fox = @{ tail = @(28, 53) }; snake = @{ tail = @(8, 54) }
  rabbit = @{ carrot = @(33, 26) }; monkey = @{ banana = @(31, 24) }; panda = @{ bamboo = @(32, 27) } }
function Snow-Parts($p, $kind, $u, $iw, $ih) {
  $p.parts = @{}; $def = $SNOW_PARTS[$kind]; if (-not $def) { return }
  foreach ($name in @($def.Keys)) {
    $pic = Snow-Pic "$kind-$name"; if (-not $pic) { continue }
    $im = New-Object Windows.Controls.Image; $im.Width = $iw; $im.Height = $ih; $im.Stretch = 'Fill'; $im.Source = $pic
    [Windows.Media.RenderOptions]::SetBitmapScalingMode($im, 'NearestNeighbor')
    [Windows.Controls.Canvas]::SetLeft($im, -$iw / 2); [Windows.Controls.Canvas]::SetTop($im, -58 * $u)
    $pv = $def[$name]; $im.RenderTransformOrigin = New-Object Windows.Point ($pv[0] / 36), ($pv[1] / 60)
    $rot = New-Object Windows.Media.RotateTransform 0; $tr = New-Object Windows.Media.TranslateTransform
    $tg = New-Object Windows.Media.TransformGroup; $tg.Children.Add($rot); $tg.Children.Add($tr); $im.RenderTransform = $tg
    # A tail goes behind the snow, what is held in front.
    if ($name -eq 'tail') { $p.el.Children.Insert(0, $im) } else { [void]$p.el.Children.Add($im) }
    $p.parts[$name] = @{ img = $im; rot = $rot; tr = $tr }
  }
  Snow-Idle $p
}
# Back and forth for ever (a tail's wag): from a to b and back in ms each way.
function Sn-Loop($o, $prop, $a, $b, $ms) {
  $x = New-Object Windows.Media.Animation.DoubleAnimation $a, $b, (New-Object Windows.Duration ([TimeSpan]::FromMilliseconds($ms)))
  $x.AutoReverse = $true; $x.RepeatBehavior = [Windows.Media.Animation.RepeatBehavior]::Forever
  $e = New-Object Windows.Media.Animation.SineEase; $e.EasingMode = 'EaseInOut'; $x.EasingFunction = $e
  $o.BeginAnimation($prop, $x)
}
function Snow-Idle($p) {
  $t = $p.parts.tail; if (-not $t) { return }
  if ($p.kind -eq 'cat') { Sn-Loop $t.rot ([Windows.Media.RotateTransform]::AngleProperty) -14 16 650 }
  if ($p.kind -eq 'dog') { Sn-Loop $t.rot ([Windows.Media.RotateTransform]::AngleProperty) -22 22 140 }
  if ($p.kind -eq 'fox') { Sn-Loop $t.rot ([Windows.Media.RotateTransform]::AngleProperty) -6 8 900 }
  if ($p.kind -eq 'snake') { Sn-Loop $t.rot ([Windows.Media.RotateTransform]::AngleProperty) -10 10 700 }
}
function Sn-Img($name, $u) {
  $pic = Snow-Pic "fx-$name"; if (-not $pic) { return $null }
  $im = New-Object Windows.Controls.Image; $im.Width = $pic.PixelWidth * $u; $im.Height = $pic.PixelHeight * $u; $im.Stretch = 'Fill'; $im.Source = $pic
  [Windows.Media.RenderOptions]::SetBitmapScalingMode($im, 'NearestNeighbor')
  $rot = New-Object Windows.Media.RotateTransform 0; $tr = New-Object Windows.Media.TranslateTransform
  $tg = New-Object Windows.Media.TransformGroup; $tg.Children.Add($rot); $tg.Children.Add($tr); $im.RenderTransform = $tg; $im.RenderTransformOrigin = New-Object Windows.Point 0.5, 0.5
  @{ img = $im; rot = $rot; tr = $tr }
}
function Sn-Put2($sm, $el, $x, $y) { [Windows.Controls.Canvas]::SetLeft($el, $x); [Windows.Controls.Canvas]::SetTop($el, $y); [void]$sm.el.Children.Add($el) }
# Whole-body moves of an act hold the snowman's transforms; let them go so the tick has them back.
function Act-Stop($sm) {
  $sm.acting = $false
  $sm.rot.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, $null)
  $sm.bob.BeginAnimation([Windows.Media.TranslateTransform]::XProperty, $null); $sm.bob.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, $null)
  $sm.rot.Angle = 0; $sm.rot.CenterY = 0; $sm.bob.X = 0; $sm.bob.Y = 0
}
function Act-Done($sm, $ms) { After $ms { param($sm) if ($sm.acting) { Act-Stop $sm } } $sm }
function Snow-Act($sm) {
  if (-not $sm -or $sm.gone -or $sm.melting) { return }
  $sm.acted = $true
  switch ($sm.kind) {
    'cat' { Act-Cat $sm }
    'dog' { Act-Dog $sm }
    'penguin' { Act-Penguin $sm }
    'frog' { Act-Frog $sm }
    'dragon' { Act-Dragon $sm }
    default { Snow-Act2 $sm }
  }
}
# 🐱 A ball of yarn rolls up; a little hop at it and off it goes, rolling away. The tail flicks.
function Act-Cat($sm) {
  $u = $sm.u; $d = Snow-In $sm.x; $y = Sn-Img 'yarn' $u; if (-not $y) { return }
  $sm.acting = $true
  Sn-Put2 $sm $y.img ($d * 46 * $u - 6 * $u) (-12 * $u)
  $y.img.BeginAnimation([Windows.UIElement]::OpacityProperty, (Sn-Keys @(0, 1, 1, 0) @(0, 200, 1500, 1850)))
  $y.tr.BeginAnimation([Windows.Media.TranslateTransform]::XProperty, (Sn-Keys @(0, (-$d * 28 * $u), (-$d * 28 * $u), ($d * 40 * $u)) @(0, 800, 880, 1600)))
  $y.rot.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, (Sn-Keys @(0, (-$d * 330), (-$d * 330), ($d * 300)) @(0, 800, 880, 1600)))
  $y.tr.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, (Sn-Keys @(0, 0, (-7 * $u), 0, (-2 * $u), 0) @(0, 880, 1060, 1240, 1340, 1440)))
  After 1900 { param($q) $q[0].el.Children.Remove($q[1]) } @($sm, $y.img)
  # The pounce: a hop at it, leaning in.
  $sm.bob.BeginAnimation([Windows.Media.TranslateTransform]::XProperty, (Sn-Keys @(0, 0, ($d * 4 * $u), 0) @(0, 700, 860, 1150)))
  $sm.bob.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, (Sn-Keys @(0, 0, (-5 * $u), 0) @(0, 700, 800, 950)))
  $sm.rot.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, (Sn-Keys @(0, 0, ($d * 9), 0) @(0, 700, 860, 1200)))
  $t = $sm.parts.tail
  if ($t) { After 860 { param($t) $t.rot.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, (Sn-Keys @(0, 38, -10, 0) @(0, 120, 300, 450))); After 470 { param($t) Sn-Loop $t.rot ([Windows.Media.RotateTransform]::AngleProperty) -14 16 650 } $t } $t }
  After 880 { param($sm) $d = Snow-In $sm.x; Snow-Spark ($sm.x + $d * 18 * $sm.u) ($sm.foot - 8 * $sm.u) 2 } $sm
  Act-Done $sm 1300
}
# 🐶 The bone goes up turning and is caught; then the tail spins like a propeller, little hops.
function Act-Dog($sm) {
  $u = $sm.u; $b = $sm.parts.bone; $t = $sm.parts.tail; $sm.acting = $true
  if ($b) {
    $up = New-Object Windows.Media.Animation.QuadraticEase; $up.EasingMode = 'EaseOut'; $dn = New-Object Windows.Media.Animation.QuadraticEase; $dn.EasingMode = 'EaseIn'
    $k = New-Object Windows.Media.Animation.DoubleAnimationUsingKeyFrames; $k.Duration = New-Object Windows.Duration ([TimeSpan]::FromMilliseconds(760))
    foreach ($p in @(@(0, 0, $null), @((-36 * $u), 380, $up), @(0, 760, $dn))) { $kt = [Windows.Media.Animation.KeyTime]::FromTimeSpan([TimeSpan]::FromMilliseconds($p[1])); if ($p[2]) { [void]$k.KeyFrames.Add((New-Object Windows.Media.Animation.EasingDoubleKeyFrame $p[0], $kt, $p[2])) } else { [void]$k.KeyFrames.Add((New-Object Windows.Media.Animation.LinearDoubleKeyFrame ($p[0], $kt))) } }
    $b.tr.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, $k)
    Anim $b.rot ([Windows.Media.RotateTransform]::AngleProperty) 0 720 760 0 $null
  }
  # Caught: a squash, and the tail goes round and round.
  $sm.bob.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, (Sn-Keys @(0, 0, (2 * $u), 0, (-4 * $u), 0, (-4 * $u), 0, (-4 * $u), 0) @(0, 740, 820, 900, 1050, 1200, 1350, 1500, 1650, 1800)))
  if ($t) {
    After 780 { param($t) $x = New-Object Windows.Media.Animation.DoubleAnimation 0, 360, (New-Object Windows.Duration ([TimeSpan]::FromMilliseconds(180))); $x.RepeatBehavior = [Windows.Media.Animation.RepeatBehavior]::Forever; $t.rot.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, $x) } $t
    After 2300 { param($t) Sn-Loop $t.rot ([Windows.Media.RotateTransform]::AngleProperty) -22 22 140 } $t
  }
  for ($i = 0; $i -lt 3; $i++) { After (900 + $i * 300) { param($sm) Fx-Go (Fx-Text '♥' (10 + $S.rnd.Next(4)) '#FF7A9A') ($sm.x + $S.rnd.Next(-10, 6)) ($sm.foot - $sm.ht - 4) ($S.rnd.Next(-8, 9)) -26 900 0 } $sm }
  Act-Done $sm 1900
}
# 🐧 Off across the snow on its belly-front, leaning in, a spray behind; back again; a hop.
function Act-Penguin($sm) {
  $u = $sm.u; $d = Snow-In $sm.x; $go = $d * 42 * $u; $sm.acting = $true
  $sm.bob.BeginAnimation([Windows.Media.TranslateTransform]::XProperty, (Sn-Keys @(0, $go, $go, 0, 0) @(0, 650, 900, 1550, 1900)))
  $sm.rot.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, (Sn-Keys @(0, ($d * 13), ($d * 13), 0, (-$d * 13), (-$d * 13), 0) @(0, 120, 600, 800, 950, 1450, 1600)))
  $sm.bob.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, (Sn-Keys @(0, 0, (-8 * $u), 0) @(0, 1600, 1720, 1880)))
  for ($i = 0; $i -lt 10; $i++) {
    $back = $i -ge 5; $q = ($i % 5) / 5; $e = 1 - (1 - $q) * (1 - $q)
    $px = $(if ($back) { $go * (1 - $e) } else { $go * $e }); $dl = $(if ($back) { 900 + $q * 650 } else { $q * 650 })
    $sd = $(if ($back) { $d } else { -$d })
    for ($j = 0; $j -lt 2; $j++) { Fx-Go (Snow-Dot (3 + $S.rnd.Next(3)) '#FFFFFF' '#C9D6E8') ($sm.x + $px - $sd * 8 * $u) ($sm.foot - 3) ($sd * (10 + $S.rnd.Next(12))) (-6 - $S.rnd.Next(10)) 450 $dl }
  }
  After 1760 { param($sm) Snow-Spark $sm.x ($sm.foot - $sm.ht) 2 } $sm
  Act-Done $sm 1950
}
# 🐸 A fly buzzes round its head; the tongue shoots out and has it; a gulp, and a bubble or two.
function Act-Frog($sm) {
  $u = $sm.u; $d = Snow-In $sm.x; $f = Sn-Img 'fly' $u; if (-not $f) { return }
  $sm.acting = $true
  $cx = $d * 16 * $u; $cy = -52 * $u
  Sn-Put2 $sm $f.img ($cx - 4 * $u) ($cy - 3.5 * $u)
  $fx = New-Object Windows.Media.Animation.DoubleAnimationUsingKeyFrames; $fy = New-Object Windows.Media.Animation.DoubleAnimationUsingKeyFrames
  foreach ($k in $fx, $fy) { $k.Duration = New-Object Windows.Duration ([TimeSpan]::FromMilliseconds(800)); $k.RepeatBehavior = [Windows.Media.Animation.RepeatBehavior]::Forever }
  for ($i = 0; $i -le 16; $i++) { $a = $i / 16 * 2 * [Math]::PI; $kt = [Windows.Media.Animation.KeyTime]::FromTimeSpan([TimeSpan]::FromMilliseconds(800 * $i / 16))
    [void]$fx.KeyFrames.Add((New-Object Windows.Media.Animation.LinearDoubleKeyFrame ([Math]::Sin($a) * 7 * $u), $kt)); [void]$fy.KeyFrames.Add((New-Object Windows.Media.Animation.LinearDoubleKeyFrame ([Math]::Sin($a * 2) * 3 * $u), $kt)) }
  $f.tr.BeginAnimation([Windows.Media.TranslateTransform]::XProperty, $fx); $f.tr.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, $fy)
  After 1250 { param($q) Frog-Tongue $q[0] $q[1] $q[2] $q[3] } @($sm, $f, $cx, $cy)
  Act-Done $sm 2100
}
function Frog-Tongue($sm, $f, $cx, $cy) {
  if ($sm.gone) { return }
  $u = $sm.u; $fx = $cx + $f.tr.X; $fy = $cy + $f.tr.Y
  $f.tr.BeginAnimation([Windows.Media.TranslateTransform]::XProperty, $null); $f.tr.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, $null)
  $f.tr.X = $fx - $cx; $f.tr.Y = $fy - $cy
  $mx = 0; $my = -33 * $u; $len = [Math]::Sqrt(($fx - $mx) * ($fx - $mx) + ($fy - $my) * ($fy - $my)); $ang = [Math]::Atan2($fy - $my, $fx - $mx) * 180 / [Math]::PI
  $tg = New-Object Windows.Shapes.Rectangle; $tg.Width = $len; $tg.Height = 2.4 * $u; $tg.RadiusX = 1.2 * $u; $tg.RadiusY = 1.2 * $u; $tg.Fill = $conv.ConvertFrom('#E8627A'); $tg.Stroke = $conv.ConvertFrom('#9A2A40'); $tg.StrokeThickness = [Math]::Max(1, $u * 0.6)
  $ts = New-Object Windows.Media.ScaleTransform 0, 1; $tr2 = New-Object Windows.Media.RotateTransform $ang
  $g2 = New-Object Windows.Media.TransformGroup; $g2.Children.Add($ts); $g2.Children.Add($tr2); $tg.RenderTransform = $g2; $tg.RenderTransformOrigin = New-Object Windows.Point 0, 0.5
  Sn-Put2 $sm $tg $mx ($my - 1.2 * $u)
  $ts.BeginAnimation([Windows.Media.ScaleTransform]::ScaleXProperty, (Sn-Keys @(0, 1, 1, 0) @(0, 90, 150, 330)))
  # Caught on the tip and pulled in.
  $f.tr.BeginAnimation([Windows.Media.TranslateTransform]::XProperty, (Sn-Keys @(($fx - $cx), ($fx - $cx), ($mx - $cx)) @(0, 150, 330)))
  $f.tr.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, (Sn-Keys @(($fy - $cy), ($fy - $cy), ($my - $cy)) @(0, 150, 330)))
  After 340 { param($q) $q[0].el.Children.Remove($q[1]); $q[0].el.Children.Remove($q[2]) } @($sm, $f.img, $tg)
  # The gulp: puffed out wide, then a bubble or two going up.
  After 360 { param($sm)
    $sm.sc.BeginAnimation([Windows.Media.ScaleTransform]::ScaleXProperty, (Sn-Keys @(1, 1.2, 0.95, 1) @(0, 120, 260, 380)))
    for ($i = 0; $i -lt 3; $i++) { $c = New-Object Windows.Shapes.Ellipse; $dd = (3 + $i) * $sm.u * 0.8; $c.Width = $dd; $c.Height = $dd; $c.Stroke = $conv.ConvertFrom('#9FD8F2'); $c.StrokeThickness = 1.2
      Fx-Go $c ($sm.x + $S.rnd.Next(-4, 5)) ($sm.foot - 36 * $sm.u) ($S.rnd.Next(-6, 7)) (-26 - $i * 6) 800 (200 + $i * 160) }
  } $sm
}
# 🐲 Fireworks: three shot straight up from its mouth, each bursting big overhead and falling away.
function Act-Dragon($sm) {
  $sm.acting = $true; $d = Snow-In $sm.x
  $sm.rot.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, (Sn-Keys @(0, (-$d * 8), 0, (-$d * 8), 0, (-$d * 8), 0) @(0, 120, 450, 670, 1000, 1220, 1550)))
  foreach ($no in 0, 1, 2) { After ($no * 550) { param($q) Dragon-Rocket $q[0] $q[1] } @($sm, $no) }
  Act-Done $sm 1700
}
function Dragon-Rocket($sm, $no) {
  if ($sm.gone) { return }
  $u = $sm.u; $d = Snow-In $sm.x
  $x0 = $sm.x + $d * 2 * $u; $y0 = $sm.foot - 34 * $u
  $x1 = $sm.x + $d * @(4, 22, 12)[$no] * $u; $y1 = [Math]::Max(30, $sm.foot - $sm.ht - @(70, 56, 84)[$no])
  $up = 480
  # The rocket: a bright head going up fast, slowing, embers dropping off behind it.
  $hd = Snow-Dot 6 '#FFF6C8' '#FFB12E'; $ht = New-Object Windows.Media.TranslateTransform; $hd.RenderTransform = $ht; Fx-Add $hd ($x0 - 3) ($y0 - 3)
  $e = New-Object Windows.Media.Animation.QuadraticEase; $e.EasingMode = 'EaseOut'
  Anim $ht ([Windows.Media.TranslateTransform]::XProperty) 0 ($x1 - $x0) $up 0 $e; Anim $ht ([Windows.Media.TranslateTransform]::YProperty) 0 ($y1 - $y0) $up 0 $e
  Fx-Drop $hd $up
  for ($i = 0; $i -lt 10; $i++) { $q = $i / 10; $p = 1 - (1 - $q) * (1 - $q)
    Fx-Go (Snow-Dot (2 + $S.rnd.Next(3)) (Fx-Pick @('#FFE066', '#FFB12E', '#FF7A2E'))) ($x0 + ($x1 - $x0) * $p - 1) ($y0 + ($y1 - $y0) * $p - 1) ($S.rnd.Next(-3, 4)) (8 + $S.rnd.Next(8)) 380 ($q * $up) }
  After $up { param($q) Firework $q[0] $q[1] $q[2] } @($x1, $y1, $no)
}
# A burst: a flash, a ring of sparks flying out and drooping as they fade, a few smaller inside,
# then a twinkle here and there.
function Firework($x, $y, $no) {
  $set = @(@('#FFD24A', '#FFF2B0', '#FF9F2E'), @('#FF7AB8', '#FFD0E6', '#FF4F8A'), @('#7CE8FF', '#E6F8FF', '#5FA8FF'))[$no % 3]
  $fl = New-Object Windows.Shapes.Ellipse; $fl.Width = 40; $fl.Height = 40
  $fl.Fill = New-Object Windows.Media.RadialGradientBrush ([Windows.Media.Color]::FromArgb(220, 255, 250, 225)), ([Windows.Media.Color]::FromArgb(0, 255, 250, 225))
  $fs = New-Object Windows.Media.ScaleTransform 0.3, 0.3, 20, 20; $fl.RenderTransform = $fs; Fx-Add $fl ($x - 20) ($y - 20)
  Anim $fs ([Windows.Media.ScaleTransform]::ScaleXProperty) 0.3 1.6 260 0 $null; Anim $fs ([Windows.Media.ScaleTransform]::ScaleYProperty) 0.3 1.6 260 0 $null
  Anim $fl ([Windows.UIElement]::OpacityProperty) 1 0 280 0 $null; Fx-Drop $fl 300
  $out = New-Object Windows.Media.Animation.QuadraticEase; $out.EasingMode = 'EaseOut'
  foreach ($ring in @(@(22, 46, 5), @(10, 22, 3))) {
    $n = $ring[0]; $r = $ring[1]
    for ($i = 0; $i -lt $n; $i++) {
      $an = $i / $n * 2 * [Math]::PI + $S.rnd.NextDouble() * 0.15; $rr = $r * (0.85 + $S.rnd.NextDouble() * 0.3); $dd = $ring[2] + $S.rnd.Next(2)
      $sp = Snow-Dot $dd (Fx-Pick $set); $tt = New-Object Windows.Media.TranslateTransform; $sp.RenderTransform = $tt; Fx-Add $sp ($x - $dd / 2) ($y - $dd / 2)
      $dx = [Math]::Cos($an) * $rr; $dy = [Math]::Sin($an) * $rr * 0.85
      Anim $tt ([Windows.Media.TranslateTransform]::XProperty) 0 $dx 1000 0 $out
      $tt.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, (Sn-Keys @(0, $dy, ($dy + 24)) @(0, 420, 1100)))
      $sp.BeginAnimation([Windows.UIElement]::OpacityProperty, (Sn-Keys @(1, 1, 0) @(0, 600, 1100)))
      Fx-Drop $sp 1150
    }
  }
  for ($i = 0; $i -lt 6; $i++) { Fx-Go (Fx-Text '✦' (9 + $S.rnd.Next(6)) (Fx-Pick $set)) ($x + $S.rnd.Next(-44, 40)) ($y + $S.rnd.Next(-34, 30)) 0 10 600 (380 + $i * 90) }
}
# ── The other twenty ── (where things sit, in the snowman's own units u from its feet: the head's
# middle at (0, -38u), the mouth (0, -33u), the eyes (±2.5u, -39u), the hat's top -49u.)
# A small picture (Sn-Img) put on the effects layer itself, centred at (x, y): for things that leave
# the snowman (seeds spat, a peel thrown), so its squash and lean do not carry them.
function Sn-Fx($p, $x, $y, $ms) {
  Fx-Add $p.img ($x - $p.img.Width / 2) ($y - $p.img.Height / 2); if ($ms) { Fx-Drop $p.img $ms }; $p
}
function Sn-Path($p, $xs, $ys, $ts) {
  $p.tr.BeginAnimation([Windows.Media.TranslateTransform]::XProperty, (Sn-Keys $xs $ts))
  $p.tr.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, (Sn-Keys $ys $ts))
}
function Sn-Fade($el, $ops, $ts) { $el.BeginAnimation([Windows.UIElement]::OpacityProperty, (Sn-Keys $ops $ts)) }
function Sn-Bubble($sm, $text, $ms) {
  $b = New-Object Windows.Controls.Border; $b.Background = $conv.ConvertFrom('#F2FFFFFF'); $b.CornerRadius = 7; $b.Padding = New-Object Windows.Thickness 5, 1, 5, 2
  $b.BorderBrush = $conv.ConvertFrom('#55657E'); $b.BorderThickness = 1
  $t = New-Object Windows.Controls.TextBlock; $t.Text = $text; $t.FontSize = 11; $t.FontWeight = 'Bold'; $t.FontFamily = New-Object Windows.Media.FontFamily 'Malgun Gothic'; $t.Foreground = $conv.ConvertFrom('#3A3550')
  $b.Child = $t; $b.Measure((New-Object Windows.Size ([double]::PositiveInfinity), ([double]::PositiveInfinity)))
  $d = Snow-In $sm.x; $bx = $(if ($d -lt 0) { $sm.x - $b.DesiredSize.Width - 4 * $sm.u } else { $sm.x + 4 * $sm.u })
  $sc = New-Object Windows.Media.ScaleTransform 0, 0; $b.RenderTransform = $sc; $b.RenderTransformOrigin = New-Object Windows.Point $(if ($d -lt 0) { 1 } else { 0 }), 1
  Fx-Add $b $bx ($sm.foot - $sm.ht - $b.DesiredSize.Height)
  $pop = New-Object Windows.Media.Animation.BackEase; $pop.Amplitude = 0.8
  Anim $sc ([Windows.Media.ScaleTransform]::ScaleXProperty) 0 1 260 0 $pop; Anim $sc ([Windows.Media.ScaleTransform]::ScaleYProperty) 0 1 260 0 $pop
  Sn-Fade $b @(1, 1, 0) @(0, ($ms - 250), $ms); Fx-Drop $b ($ms + 20)
}
function Snow-Act2($sm) {
  switch ($sm.kind) {
    'rabbit' { Act-Rabbit $sm } 'chick' { Act-Chick $sm } 'hamster' { Act-Hamster $sm } 'fox' { Act-Fox $sm }
    'bear' { Act-Bear $sm } 'panda' { Act-Panda $sm } 'pig' { Act-Pig $sm } 'mouse' { Act-Mouse $sm }
    'parrot' { Act-Parrot $sm } 'owl' { Act-Owl $sm } 'duck' { Act-Duck $sm } 'tiger' { Act-Tiger $sm }
    'ox' { Act-Ox $sm } 'snake' { Act-Snake $sm } 'horse' { Act-Horse $sm } 'sheep' { Act-Sheep $sm }
    'monkey' { Act-Monkey $sm } 'rooster' { Act-Rooster $sm } 'shark' { Act-Shark $sm } 'hedgehog' { Act-Hedgehog $sm }
  }
}
# 🐰 The carrot up to its mouth, crunched (crumbs falling), then two happy hops.
function Act-Rabbit($sm) {
  $u = $sm.u; $c = $sm.parts.carrot; $sm.acting = $true
  if ($c) {
    $c.tr.BeginAnimation([Windows.Media.TranslateTransform]::XProperty, (Sn-Keys @(0, (-12 * $u), (-12 * $u), 0) @(0, 260, 1100, 1350)))
    $c.tr.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, (Sn-Keys @(0, (-2 * $u), (-2 * $u), 0) @(0, 260, 1100, 1350)))
    $c.rot.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, (Sn-Keys @(0, -72, -60, -74, -60, -74, -62, 0) @(0, 260, 420, 580, 740, 900, 1060, 1350)))
  }
  for ($i = 0; $i -lt 9; $i++) { Fx-Go (Snow-Dot (2 + $S.rnd.Next(2)) (Fx-Pick @('#F28A2E', '#D86A1C', '#F7A24A'))) ($sm.x + $S.rnd.Next(-3, 4) * $u) ($sm.foot - 33 * $u) ($S.rnd.Next(-10, 11)) (18 + $S.rnd.Next(12)) 450 (380 + $i * 80) }
  $sm.bob.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, (Sn-Keys @(0, 0, (-7 * $u), 0, (-7 * $u), 0) @(0, 1350, 1480, 1610, 1740, 1870)))
  Act-Done $sm 1950
}
# 🐥 Two little chicks walk out from behind it, a few steps out, and back in again.
function Act-Chick($sm) {
  $u = $sm.u; $d = Snow-In $sm.x; $fr = Frames 'chick'; $sm.acting = $true
  $sz = [Math]::Max(10, $sm.size * 0.45)
  foreach ($j in 0, 1) {
    $im = New-Object Windows.Controls.Image; $im.Width = $sz; $im.Height = $sz; $im.Stretch = 'Fill'; $im.Source = $fr[0]
    [Windows.Media.RenderOptions]::SetBitmapScalingMode($im, 'NearestNeighbor')
    $ob = New-Object Windows.Media.Animation.ObjectAnimationUsingKeyFrames; $ob.Duration = New-Object Windows.Duration ([TimeSpan]::FromMilliseconds(400)); $ob.RepeatBehavior = [Windows.Media.Animation.RepeatBehavior]::Forever
    for ($k = 0; $k -lt 4; $k++) { [void]$ob.KeyFrames.Add((New-Object Windows.Media.Animation.DiscreteObjectKeyFrame $fr[@(0, 1, 3, 1)[$k]], ([Windows.Media.Animation.KeyTime]::FromTimeSpan([TimeSpan]::FromMilliseconds($k * 100))))) }
    $im.BeginAnimation([Windows.Controls.Image]::SourceProperty, $ob)
    $sc = New-Object Windows.Media.ScaleTransform $d, 1; $tr = New-Object Windows.Media.TranslateTransform
    $tg = New-Object Windows.Media.TransformGroup; $tg.Children.Add($sc); $tg.Children.Add($tr); $im.RenderTransform = $tg; $im.RenderTransformOrigin = New-Object Windows.Point 0.5, 1
    $sm.el.Children.Insert(0, $im); [Windows.Controls.Canvas]::SetLeft($im, -$sz / 2); [Windows.Controls.Canvas]::SetTop($im, -$sz)
    $dl = $j * 260; $far = $d * (16 + 11 * (1 - $j)) * $u
    $tr.BeginAnimation([Windows.Media.TranslateTransform]::XProperty, (Sn-Keys @(0, 0, $far, $far, 0) @(0, $dl, ($dl + 700), ($dl + 1000), ($dl + 1700))))
    $sc.BeginAnimation([Windows.Media.ScaleTransform]::ScaleXProperty, (Sn-Keys @($d, $d, (-$d), (-$d)) @(0, ($dl + 980), ($dl + 1020), ($dl + 1700))))
    Sn-Fade $im @(0, 0, 1, 1, 0) @(0, $dl, ($dl + 150), ($dl + 1550), ($dl + 1700))
    After ($dl + 1750) { param($q) $q[0].el.Children.Remove($q[1]) } @($sm, $im)
  }
  $sm.bob.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, (Sn-Keys @(0, (-4 * $u), 0, (-4 * $u), 0) @(0, 120, 240, 360, 480)))
  Act-Done $sm 2050
}
# 🐹 Cheeks puffed out wide — then seeds spat out one after another, landing on the snow.
function Act-Hamster($sm) {
  $u = $sm.u; $d = Snow-In $sm.x; $sm.acting = $true
  $sm.sc.BeginAnimation([Windows.Media.ScaleTransform]::ScaleXProperty, (Sn-Keys @(1, 1.22, 1.16, 1.22, 1.12, 1.16, 1.06, 1.08, 1) @(0, 300, 450, 600, 760, 900, 1060, 1200, 1400)))
  for ($i = 0; $i -lt 5; $i++) {
    $sd = Sn-Img 'seed' $u; if (-not $sd) { break }
    $x0 = $sm.x + $d * 3 * $u; $y0 = $sm.foot - 33 * $u; $far = $d * (16 + 7 * $i + $S.rnd.Next(5)) * $u
    [void](Sn-Fx $sd $x0 $y0 1950); $sd.img.Opacity = 0; $t0 = 700 + $i * 150
    $sd.tr.BeginAnimation([Windows.Media.TranslateTransform]::XProperty, (Sn-Keys @(0, 0, ($far * 0.6), $far, $far) @(0, $t0, ($t0 + 160), ($t0 + 320), 1950)))
    $sd.tr.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, (Sn-Keys @(0, 0, (-12 * $u), (31 * $u), (29 * $u), (31 * $u)) @(0, $t0, ($t0 + 140), ($t0 + 320), ($t0 + 380), ($t0 + 440))))
    $sd.rot.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, (Sn-Keys @(0, 0, ($d * 400)) @(0, $t0, ($t0 + 330))))
    Sn-Fade $sd.img @(0, 0, 1, 1, 0) @(0, $t0, ($t0 + 20), 1650, 1950)
  }
  Act-Done $sm 1500
}
# 🦊 A big sweep of the tail, and two blue foxfires circling round it.
function Act-Fox($sm) {
  $u = $sm.u; $t = $sm.parts.tail; $sm.acting = $true
  if ($t) { $t.rot.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, (Sn-Keys @(0, -40, 25, -30, 15, 0) @(0, 260, 600, 950, 1300, 1600))) }
  foreach ($j in 0, 1) {
    $ff = Sn-Img 'foxfire' $u; if (-not $ff) { break }
    [void](Sn-Fx $ff $sm.x ($sm.foot - 28 * $u) 1950)
    $xs = @(); $ys = @(); $ts = @(); $ops = @()
    for ($k = 0; $k -le 20; $k++) { $a = $k / 10 * [Math]::PI + $j * [Math]::PI; $xs += [Math]::Cos($a) * 17 * $u; $ys += [Math]::Sin($a) * 6 * $u - $k * 0.6 * $u; $ts += 80 * $k; $ops += $(if ([Math]::Sin($a) -lt 0) { 0.45 } else { 1 }) }
    Sn-Path $ff $xs $ys $ts
    $ops[0] = 0; $ops[20] = 0; Sn-Fade $ff.img $ops $ts
  }
  Act-Done $sm 1650
}
# 🐻 A bee buzzes round its head; a swat, another; off goes the bee, and a heart.
function Act-Bear($sm) {
  $u = $sm.u; $d = Snow-In $sm.x; $b = Sn-Img 'bee' $u; if (-not $b) { return }
  $sm.acting = $true
  [void](Sn-Fx $b $sm.x ($sm.foot - 42 * $u) 1900)
  $xs = @(); $ys = @(); $ts = @()
  for ($k = 0; $k -le 14; $k++) { $a = $k / 7 * [Math]::PI; $xs += [Math]::Cos($a) * 14 * $u; $ys += [Math]::Sin($a * 2) * 4 * $u; $ts += 90 * $k }
  $xs += $d * 40 * $u; $ys += -30 * $u; $ts += 1650
  Sn-Path $b $xs $ys $ts; Sn-Fade $b.img @(0, 1, 1, 0) @(0, 150, 1400, 1650)
  $b.rot.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, (Sn-Keys @(0, -10, 10, -10, 10, -10, 10, 0) @(0, 200, 400, 600, 800, 1000, 1200, 1400)))
  $sm.rot.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, (Sn-Keys @(0, 0, -9, 0, 0, 9, 0) @(0, 500, 620, 800, 950, 1070, 1250)))
  After 1450 { param($sm) Fx-Go (Fx-Text '♥' 13 '#FF7A9A') ($sm.x - 4) ($sm.foot - $sm.ht - 6) 0 -24 900 0 } $sm
  Act-Done $sm 1500
}
# 🐼 Munches on the bamboo (bits flying), then a roll over sideways and back up like a roly-poly.
function Act-Panda($sm) {
  $u = $sm.u; $d = Snow-In $sm.x; $bb = $sm.parts.bamboo; $sm.acting = $true
  if ($bb) { $bb.rot.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, (Sn-Keys @(0, -38, -30, -38, -30, 0) @(0, 160, 300, 440, 580, 720))) }
  for ($i = 0; $i -lt 6; $i++) { Fx-Go (Snow-Dot (2 + $S.rnd.Next(2)) (Fx-Pick @('#7CC46A', '#5FA84A'))) ($sm.x + $S.rnd.Next(-2, 5) * $u) ($sm.foot - 34 * $u) ($S.rnd.Next(-10, 11)) (16 + $S.rnd.Next(12)) 450 (200 + $i * 80) }
  $sm.rot.CenterY = -$sm.ht / 2
  $sm.rot.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, (Sn-Keys @(0, 0, ($d * 360), ($d * 348), ($d * 368), ($d * 356), ($d * 360), 0) @(0, 760, 1300, 1420, 1540, 1640, 1720, 2250)))
  $sm.bob.BeginAnimation([Windows.Media.TranslateTransform]::XProperty, (Sn-Keys @(0, 0, ($d * 22 * $u), ($d * 22 * $u), 0) @(0, 760, 1300, 1720, 2250)))
  After 1300 { param($sm) Snow-Puff ($sm.x + (Snow-In $sm.x) * 22 * $sm.u) ($sm.foot - 4) 5 18 } $sm
  Act-Done $sm 2300
}
# 🐷 A jump into a mud puddle, splash; hearts puff out of its snout.
function Act-Pig($sm) {
  $u = $sm.u; $sm.acting = $true
  $pd = New-Object Windows.Shapes.Ellipse; $pd.Width = 36 * $u; $pd.Height = 7 * $u; $pd.Fill = $conv.ConvertFrom('#AA7A5034'); $pd.Stroke = $conv.ConvertFrom('#6A4020'); $pd.StrokeThickness = 1
  $sm.el.Children.Insert(0, $pd); [Windows.Controls.Canvas]::SetLeft($pd, -18 * $u); [Windows.Controls.Canvas]::SetTop($pd, -3.5 * $u)
  Sn-Fade $pd @(0, 0, 1, 1, 0) @(0, 300, 420, 1700, 2000); After 2050 { param($q) $q[0].el.Children.Remove($q[1]) } @($sm, $pd)
  $sm.bob.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, (Sn-Keys @(0, (-9 * $u), 0, (2 * $u), 0) @(0, 180, 400, 470, 560)))
  for ($i = 0; $i -lt 12; $i++) { $an = [Math]::PI * (1.05 + 0.9 * $i / 11); $r = 14 + $S.rnd.Next(14)
    Fx-Go (Snow-Dot (3 + $S.rnd.Next(4)) (Fx-Pick @('#8A5A34', '#6A4020', '#A0703E'))) ($sm.x + [Math]::Cos($an) * 12 * $u) ($sm.foot - 3) ([Math]::Cos($an) * $r) ([Math]::Sin($an) * $r * 0.8) 520 400 }
  for ($i = 0; $i -lt 4; $i++) {
    $h = Sn-Img 'heart' $u; if (-not $h) { break }
    [void](Sn-Fx $h ($sm.x + ($i % 2 * 2 - 1) * 2 * $u) ($sm.foot - 35 * $u) 2100); $t0 = 700 + $i * 260
    Sn-Path $h @(0, 0, ($S.rnd.Next(-8, 9)), ($S.rnd.Next(-12, 13))) @(0, 0, (-14 * $u), (-26 * $u)) @(0, $t0, ($t0 + 450), ($t0 + 900))
    Sn-Fade $h.img @(0, 0, 1, 1, 0) @(0, $t0, ($t0 + 80), ($t0 + 650), ($t0 + 900))
  }
  Act-Done $sm 700
}
# 🐭 Leans down to its cheese and nibbles: one hole, two, three, crumbs flying.
function Act-Mouse($sm) {
  $u = $sm.u; $sm.acting = $true
  $sm.rot.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, (Sn-Keys @(0, 7, 5, 7, 5, 7, 5, 7, 0) @(0, 250, 450, 650, 850, 1050, 1250, 1450, 1700)))
  $holes = @(@(14, -4.5), @(16.6, -6.4), @(11.6, -3.2))
  for ($i = 0; $i -lt 3; $i++) {
    $hx = $holes[$i][0] * $u; $hy = $holes[$i][1] * $u; $t0 = 450 + $i * 400
    $o = New-Object Windows.Shapes.Ellipse; $o.Width = 2.2 * $u; $o.Height = 1.8 * $u; $o.Fill = $conv.ConvertFrom('#B07A14'); $o.Opacity = 0
    Sn-Put2 $sm $o ($hx - 1.1 * $u) ($hy - 0.9 * $u)
    After $t0 { param($q) $q[0].Opacity = 1; $sm = $q[1]; for ($k = 0; $k -lt 4; $k++) { Fx-Go (Snow-Dot (2 + $S.rnd.Next(2)) (Fx-Pick @('#F6C93C', '#FFE08A'))) ($sm.x + $q[2]) ($sm.foot + $q[3]) ($S.rnd.Next(-8, 9)) (-8 - $S.rnd.Next(8)) 380 ($k * 40) } } @($o, $sm, $hx, $hy)
  }
  Act-Done $sm 1750
}
# 🦜 Head-bobs to its own "메리 크리스마스!", the bubble bouncing, feathers flying up and floating down.
function Act-Parrot($sm) {
  $u = $sm.u; $sm.acting = $true
  $sm.bob.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, (Sn-Keys @(0, (-4 * $u), 0, (-4 * $u), 0, (-4 * $u), 0) @(0, 120, 240, 360, 480, 600, 720)))
  if ($sm.bub) { $bs = New-Object Windows.Media.ScaleTransform 1, 1; $sm.bub.RenderTransform = $bs; $sm.bub.RenderTransformOrigin = New-Object Windows.Point 0.5, 1
    $bs.BeginAnimation([Windows.Media.ScaleTransform]::ScaleXProperty, (Sn-Keys @(1, 1.25, 0.95, 1.08, 1) @(0, 120, 260, 380, 500))); $bs.BeginAnimation([Windows.Media.ScaleTransform]::ScaleYProperty, (Sn-Keys @(1, 1.25, 0.95, 1.08, 1) @(0, 120, 260, 380, 500))) }
  for ($i = 0; $i -lt 6; $i++) {
    $f = Sn-Img (@('feather-r', 'feather-g', 'feather-y')[$i % 3]) $u; if (-not $f) { break }
    [void](Sn-Fx $f $sm.x ($sm.foot - 42 * $u) 2300); $an = [Math]::PI * (1.15 + 0.7 * $i / 5); $r = (14 + $S.rnd.Next(8)) * $u
    $ex = [Math]::Cos($an) * $r; $ey = [Math]::Sin($an) * $r
    Sn-Path $f @(0, $ex, ($ex + 5 * $u), ($ex - 5 * $u), ($ex + 4 * $u)) @(0, $ey, ($ey + 10 * $u), ($ey + 20 * $u), ($ey + 30 * $u)) @(0, 300, 900, 1500, 2100)
    $f.rot.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, (Sn-Keys @(0, 40, -30, 30, -20) @(0, 300, 900, 1500, 2100)))
    Sn-Fade $f.img @(1, 1, 0) @(0, 1700, 2200)
  }
  Act-Done $sm 800
}
# 🦉 The head turns right round (a flip) and back; the big eyes glow and blink; stars twinkle.
function Act-Owl($sm) {
  $u = $sm.u; $sm.acting = $true
  $sm.sc.BeginAnimation([Windows.Media.ScaleTransform]::ScaleXProperty, (Sn-Keys @(1, 1, -1, -1, 1) @(0, 200, 330, 700, 830)))
  foreach ($ex in -2.5, 2.5) {
    $g = New-Object Windows.Shapes.Ellipse; $g.Width = 5 * $u; $g.Height = 5 * $u
    $g.Fill = New-Object Windows.Media.RadialGradientBrush ([Windows.Media.Color]::FromArgb(255, 255, 236, 120)), ([Windows.Media.Color]::FromArgb(0, 255, 210, 60))
    $gs = New-Object Windows.Media.ScaleTransform 1, 1; $g.RenderTransform = $gs; $g.RenderTransformOrigin = New-Object Windows.Point 0.5, 0.5
    Sn-Put2 $sm $g (($ex - 2.5) * $u) (-41.5 * $u)
    Sn-Fade $g @(0, 0, 1, 1, 0) @(0, 900, 1050, 1900, 2100)
    $gs.BeginAnimation([Windows.Media.ScaleTransform]::ScaleYProperty, (Sn-Keys @(1, 1, 0.1, 1, 1, 0.1, 1) @(0, 1300, 1380, 1460, 1600, 1680, 1760)))
    After 2150 { param($q) $q[0].el.Children.Remove($q[1]) } @($sm, $g)
  }
  for ($i = 0; $i -lt 6; $i++) { Fx-Go (Fx-Text '✦' (8 + $S.rnd.Next(5)) (Fx-Pick @('#FFF2B0', '#CFEFFF', '#FFFFFF'))) ($sm.x + $S.rnd.Next(-24, 20)) ($sm.foot - $sm.ht - $S.rnd.Next(0, 20)) 0 -6 700 (950 + $i * 140) }
  Act-Done $sm 900
}
# 🦆 A little pond under it, a rubber duck floating across, rings on the water.
function Act-Duck($sm) {
  $u = $sm.u; $d = Snow-In $sm.x; $sm.acting = $true
  $pd = New-Object Windows.Shapes.Ellipse; $pd.Width = 40 * $u; $pd.Height = 8 * $u; $pd.Fill = $conv.ConvertFrom('#998CCBF0'); $pd.Stroke = $conv.ConvertFrom('#AA5FA8D8'); $pd.StrokeThickness = 1
  $sm.el.Children.Insert(0, $pd); [Windows.Controls.Canvas]::SetLeft($pd, -20 * $u); [Windows.Controls.Canvas]::SetTop($pd, -4 * $u)
  Sn-Fade $pd @(0, 1, 1, 0) @(0, 250, 2100, 2400); After 2450 { param($q) $q[0].el.Children.Remove($q[1]) } @($sm, $pd)
  $dk = Sn-Img 'duckie' $u
  if ($dk) {
    $dk.img.RenderTransformOrigin = New-Object Windows.Point 0.5, 1
    Sn-Put2 $sm $dk.img (-$d * 17 * $u - 5.5 * $u) (-8 * $u); $dk.img.Opacity = 0
    if ($d -lt 0) { $dk.img.LayoutTransform = New-Object Windows.Media.ScaleTransform -1, 1 }
    $xs = @(); $ys = @(); $ts = @()
    for ($k = 0; $k -le 12; $k++) { $xs += $d * 34 * $u * $k / 12; $ys += [Math]::Sin($k * 1.4) * 1.2 * $u; $ts += 300 + 140 * $k }
    $xs = @(0) + $xs; $ys = @(0) + $ys; $ts = @(0) + $ts
    Sn-Path $dk $xs $ys $ts; Sn-Fade $dk.img @(0, 0, 1, 1, 0) @(0, 300, 450, 1800, 2000)
    $dk.rot.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, (Sn-Keys @(0, -8, 8, -8, 8, 0) @(0, 600, 900, 1200, 1500, 1800)))
    After 2050 { param($q) $q[0].el.Children.Remove($q[1]) } @($sm, $dk.img)
  }
  for ($i = 0; $i -lt 3; $i++) {
    $rg = New-Object Windows.Shapes.Ellipse; $rg.Width = 10 * $u; $rg.Height = 2.4 * $u; $rg.Stroke = $conv.ConvertFrom('#E6F6FF'); $rg.StrokeThickness = 1
    $rs = New-Object Windows.Media.ScaleTransform 0.3, 0.3; $rg.RenderTransform = $rs; $rg.RenderTransformOrigin = New-Object Windows.Point 0.5, 0.5
    Sn-Put2 $sm $rg (($S.rnd.Next(-10, 6)) * $u) (-2.4 * $u); $t0 = 500 + $i * 450
    $rs.BeginAnimation([Windows.Media.ScaleTransform]::ScaleXProperty, (Sn-Keys @(0.3, 0.3, 2) @(0, $t0, ($t0 + 600)))); $rs.BeginAnimation([Windows.Media.ScaleTransform]::ScaleYProperty, (Sn-Keys @(0.3, 0.3, 2) @(0, $t0, ($t0 + 600))))
    Sn-Fade $rg @(0, 0, 1, 0) @(0, $t0, ($t0 + 60), ($t0 + 600)); After ($t0 + 650) { param($q) $q[0].el.Children.Remove($q[1]) } @($sm, $rg)
  }
  Act-Done $sm 600
}
# 🐯 A crouch, then a roar: rings of sound go out, snow is blown off, everything shakes.
function Act-Tiger($sm) {
  $u = $sm.u; $d = Snow-In $sm.x; $sm.acting = $true
  $sm.rot.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, (Sn-Keys @(0, (-$d * 8), ($d * 6), ($d * 6), 0) @(0, 350, 480, 1100, 1300)))
  $sm.bob.BeginAnimation([Windows.Media.TranslateTransform]::XProperty, (Sn-Keys @(0, 0, -2, 2, -2, 2, -2, 2, 0) @(0, 480, 560, 640, 720, 800, 880, 960, 1040)))
  for ($i = 0; $i -lt 3; $i++) {
    $rg = New-Object Windows.Shapes.Ellipse; $rg.Width = 30; $rg.Height = 22; $rg.Stroke = $conv.ConvertFrom('#FFB04A'); $rg.StrokeThickness = 2.5
    $rs = New-Object Windows.Media.ScaleTransform 0.2, 0.2, 15, 11; $rg.RenderTransform = $rs; Fx-Add $rg ($sm.x + $d * 4 * $u - 15) ($sm.foot - 33 * $u - 11)
    $t0 = 480 + $i * 170
    $rs.BeginAnimation([Windows.Media.ScaleTransform]::ScaleXProperty, (Sn-Keys @(0.2, 0.2, 2.6) @(0, $t0, ($t0 + 550)))); $rs.BeginAnimation([Windows.Media.ScaleTransform]::ScaleYProperty, (Sn-Keys @(0.2, 0.2, 2.6) @(0, $t0, ($t0 + 550))))
    Sn-Fade $rg @(0, 0, 1, 0) @(0, $t0, ($t0 + 40), ($t0 + 550)); Fx-Drop $rg ($t0 + 600)
  }
  for ($i = 0; $i -lt 14; $i++) { $an = $S.rnd.NextDouble() * 2 * [Math]::PI
    Fx-Go (Snow-Dot (3 + $S.rnd.Next(3)) '#FFFFFF' '#C9D6E8') ($sm.x + [Math]::Cos($an) * 8 * $u) ($sm.foot - 30 * $u + [Math]::Sin($an) * 12 * $u) ([Math]::Cos($an) * 40 + $d * 20) ([Math]::Sin($an) * 24) 600 (500 + $S.rnd.Next(200)) }
  Act-Done $sm 1350
}
# 🐮 Nods along to its own bell: a jingle, notes going up.
function Act-Ox($sm) {
  $u = $sm.u; $sm.acting = $true
  $sm.rot.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, (Sn-Keys @(0, -5, 5, -5, 5, -5, 5, 0) @(0, 220, 440, 660, 880, 1100, 1320, 1500)))
  for ($i = 0; $i -lt 5; $i++) {
    $n = Sn-Img 'note' $u; if (-not $n) { break }
    [void](Sn-Fx $n ($sm.x + ($i % 2 * 2 - 1) * 3 * $u) ($sm.foot - 30 * $u) 2200); $t0 = 150 + $i * 260; $sx = ($i % 2 * 2 - 1) * (10 + $S.rnd.Next(8)) * $u
    Sn-Path $n @(0, 0, ($sx * 0.6), $sx) @(0, 0, (-16 * $u), (-30 * $u)) @(0, $t0, ($t0 + 450), ($t0 + 900))
    Sn-Fade $n.img @(0, 0, 1, 1, 0) @(0, $t0, ($t0 + 60), ($t0 + 650), ($t0 + 900))
  }
  for ($i = 0; $i -lt 4; $i++) { Fx-Go (Fx-Text '✦' 9 '#FFE066') ($sm.x + $S.rnd.Next(-8, 4)) ($sm.foot - 32 * $u + $S.rnd.Next(-4, 4)) 0 -4 400 ($i * 300) }
  Act-Done $sm 1550
}
# 🐍 Sways as if charmed, the tail wiggling, the forked tongue flicking out and in.
function Act-Snake($sm) {
  $u = $sm.u; $t = $sm.parts.tail; $sm.acting = $true
  $sm.rot.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, (Sn-Keys @(0, -6, 6, -6, 6, -6, 0) @(0, 300, 600, 900, 1200, 1500, 1750)))
  if ($t) { $t.rot.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, (Sn-Keys @(0, 28, -20, 28, -20, 28, -20, 0) @(0, 200, 400, 600, 800, 1000, 1200, 1400))) }
  $tg = New-Object Windows.Shapes.Polyline; $tg.Stroke = $conv.ConvertFrom('#E0304A'); $tg.StrokeThickness = [Math]::Max(1, $u * 0.9)
  foreach ($pt in @(@(0, 0), @(0, 7), @(-2, 9.5), @(0, 7), @(2, 9.5))) { $tg.Points.Add((New-Object Windows.Point ($pt[0] * $u), ($pt[1] * $u))) }
  $ts = New-Object Windows.Media.ScaleTransform 1, 0; $tg.RenderTransform = $ts
  Sn-Put2 $sm $tg 0 (-29 * $u)
  $ts.BeginAnimation([Windows.Media.ScaleTransform]::ScaleYProperty, (Sn-Keys @(0, 0, 1, 0, 0, 1, 0, 0, 1, 0) @(0, 300, 380, 470, 650, 730, 820, 1000, 1080, 1170)))
  After 1250 { param($q) $q[0].el.Children.Remove($q[1]) } @($sm, $tg)
  Act-Done $sm 1800
}
# 🐴 Rears up and stamps down, twice — snow kicked up behind, the wind in its mane.
function Act-Horse($sm) {
  $u = $sm.u; $d = Snow-In $sm.x; $sm.acting = $true
  $sm.rot.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, (Sn-Keys @(0, (-$d * 12), 0, 0, (-$d * 12), 0) @(0, 300, 450, 750, 1050, 1200)))
  $sm.bob.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, (Sn-Keys @(0, (-6 * $u), 0, 0, (-6 * $u), 0) @(0, 300, 450, 750, 1050, 1200)))
  foreach ($t0 in 450, 1200) { After $t0 { param($sm) $d = Snow-In $sm.x
      for ($i = 0; $i -lt 8; $i++) { Fx-Go (Snow-Dot (3 + $S.rnd.Next(3)) '#FFFFFF' '#C9D6E8') ($sm.x - $d * 6 * $sm.u) ($sm.foot - 3) (-$d * (14 + $S.rnd.Next(22))) (-8 - $S.rnd.Next(16)) 500 0 }
      Snow-Puff $sm.x ($sm.foot - 3) 4 16 } $sm }
  for ($i = 0; $i -lt 5; $i++) {
    $ln = New-Object Windows.Shapes.Rectangle; $ln.Width = 10 + $S.rnd.Next(8); $ln.Height = 1.5; $ln.Fill = $conv.ConvertFrom('#CCFFFFFF')
    Fx-Go $ln ($sm.x + $d * 26 * $u) ($sm.foot - (40 + $S.rnd.Next(10)) * $u) (-$d * 50 * $u) 0 600 (200 + $i * 220)
  }
  Act-Done $sm 1300
}
# 🐑 Fluffs up and floats like a cloud, drifting a little, then settles back down.
function Act-Sheep($sm) {
  $u = $sm.u; $sm.acting = $true
  $up = New-Object Windows.Media.Animation.SineEase; $up.EasingMode = 'EaseInOut'
  $sm.sc.BeginAnimation([Windows.Media.ScaleTransform]::ScaleXProperty, (Sn-Keys @(1, 1.14, 1.14, 1) @(0, 300, 1700, 2000))); $sm.sc.BeginAnimation([Windows.Media.ScaleTransform]::ScaleYProperty, (Sn-Keys @(1, 1.1, 1.1, 1) @(0, 300, 1700, 2000)))
  $sm.bob.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, (Sn-Keys @(0, (-16 * $u), (-12 * $u), (-16 * $u), 0) @(0, 700, 1100, 1500, 2000)))
  $sm.rot.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, (Sn-Keys @(0, 4, -4, 4, 0) @(0, 600, 1000, 1400, 1900)))
  foreach ($t0 in 300, 700, 1100, 1500) { After $t0 { param($sm) for ($i = 0; $i -lt 3; $i++) { $c = Snow-Dot (8 + $S.rnd.Next(6)) '#F6F8FF' '#C9D6E8'; Fx-Go $c ($sm.x + $S.rnd.Next(-14, 10) * $sm.u * 0.6) ($sm.foot - 6) ($S.rnd.Next(-10, 11)) 6 700 0 } } $sm }
  Act-Done $sm 2050
}
# 🐵 Eats the banana in two bites, throws the peel over its shoulder, and bounces about.
function Act-Monkey($sm) {
  $u = $sm.u; $d = Snow-In $sm.x; $bn = $sm.parts.banana; $sm.acting = $true
  if ($bn) {
    $bn.tr.BeginAnimation([Windows.Media.TranslateTransform]::XProperty, (Sn-Keys @(0, (-11 * $u), (-11 * $u)) @(0, 250, 900)))
    $bn.tr.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, (Sn-Keys @(0, (-4 * $u), (-4 * $u)) @(0, 250, 900)))
    $bn.rot.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, (Sn-Keys @(0, -50, -40, -50, -40) @(0, 250, 450, 650, 850)))
    Sn-Fade $bn.img @(1, 1, 0, 0, 1) @(0, 880, 920, 2100, 2300)
    After 2100 { param($b) $b.tr.BeginAnimation([Windows.Media.TranslateTransform]::XProperty, $null); $b.tr.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, $null); $b.rot.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, $null) } $bn
  }
  $pl = Sn-Img 'peel' $u
  if ($pl) {
    [void](Sn-Fx $pl $sm.x ($sm.foot - 36 * $u) 2200); $pl.img.Opacity = 0; $bx = -$d * 26 * $u
    Sn-Path $pl @(0, 0, ($bx * 0.5), $bx, $bx) @(0, 0, (-22 * $u), (33 * $u), (33 * $u)) @(0, 920, 1150, 1420, 2200)
    $pl.rot.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, (Sn-Keys @(0, 0, (-$d * 540)) @(0, 920, 1420)))
    Sn-Fade $pl.img @(0, 0, 1, 1, 0) @(0, 900, 930, 1900, 2200)
  }
  $sm.bob.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, (Sn-Keys @(0, 0, (-6 * $u), 0, (-6 * $u), 0) @(0, 1450, 1570, 1690, 1810, 1930)))
  Act-Done $sm 2000
}
# 🐓 Leans back and crows: a little sun comes up behind it, its rays turning, "꼬끼오!".
function Act-Rooster($sm) {
  $u = $sm.u; $d = Snow-In $sm.x; $sm.acting = $true
  $sm.rot.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, (Sn-Keys @(0, (-$d * 12), (-$d * 12), 0) @(0, 300, 1100, 1350)))
  $sn = Sn-Img 'sun' $u
  if ($sn) {
    $sm.el.Children.Insert(0, $sn.img); [Windows.Controls.Canvas]::SetLeft($sn.img, ($d * 12 - 7.5) * $u); [Windows.Controls.Canvas]::SetTop($sn.img, -46 * $u)
    $sn.tr.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, (Sn-Keys @(0, (-22 * $u), (-24 * $u)) @(0, 700, 1800)))
    Anim $sn.rot ([Windows.Media.RotateTransform]::AngleProperty) 0 120 2000 0 $null
    Sn-Fade $sn.img @(0, 1, 1, 0) @(0, 300, 1600, 2000)
    After 2050 { param($q) $q[0].el.Children.Remove($q[1]) } @($sm, $sn.img)
  }
  After 350 { param($sm) Sn-Bubble $sm '꼬끼오~!' 1300 } $sm
  for ($i = 0; $i -lt 5; $i++) { Fx-Go (Fx-Text '✦' (9 + $S.rnd.Next(4)) '#FFD24A') ($sm.x + $d * 12 * $sm.u + $S.rnd.Next(-20, 16)) ($sm.foot - 70 * $sm.u + $S.rnd.Next(-12, 12)) 0 -6 600 (700 + $i * 150) }
  Act-Done $sm 1400
}
# 🦈 The snow turns to water round it and a fin goes round and round it, then dives.
function Act-Shark($sm) {
  $u = $sm.u; $sm.acting = $true
  $pd = New-Object Windows.Shapes.Ellipse; $pd.Width = 46 * $u; $pd.Height = 10 * $u; $pd.Fill = $conv.ConvertFrom('#996FB4E0'); $pd.Stroke = $conv.ConvertFrom('#AA3F88C0'); $pd.StrokeThickness = 1
  $sm.el.Children.Insert(0, $pd); [Windows.Controls.Canvas]::SetLeft($pd, -23 * $u); [Windows.Controls.Canvas]::SetTop($pd, -5 * $u)
  Sn-Fade $pd @(0, 1, 1, 0) @(0, 250, 2000, 2300); After 2350 { param($q) $q[0].el.Children.Remove($q[1]) } @($sm, $pd)
  $fn = Sn-Img 'fin' $u
  if ($fn) {
    $fn.img.RenderTransformOrigin = New-Object Windows.Point 0.5, 1
    Sn-Put2 $sm $fn.img (-4.5 * $u) (-9 * $u)
    $xs = @(); $ys = @(); $ts = @(); $ops = @()
    for ($k = 0; $k -le 24; $k++) { $a = $k / 12 * 2 * [Math]::PI; $xs += [Math]::Cos($a) * 19 * $u; $ys += [Math]::Sin($a) * 3.5 * $u; $ts += 250 + 70 * $k; $ops += $(if ([Math]::Sin($a) -lt -0.2) { 0.35 } else { 1 }) }
    $xs = @(0) + $xs; $ys = @(0) + $ys; $ts = @(0) + $ts; $ops = @(0) + $ops; $ops[1] = 0
    Sn-Path $fn $xs $ys $ts; Sn-Fade $fn.img $ops $ts
    $fs = New-Object Windows.Media.ScaleTransform 1, 1; $fn.img.LayoutTransform = $fs
    After 2000 { param($q) $q[0].el.Children.Remove($q[1]) } @($sm, $fn.img)
  }
  for ($i = 0; $i -lt 8; $i++) { Fx-Go (Snow-Dot (2 + $S.rnd.Next(3)) '#BFE6FF') ($sm.x + $S.rnd.Next(-18, 18) * $u) ($sm.foot - 3) ($S.rnd.Next(-6, 7)) (-10 - $S.rnd.Next(8)) 400 (300 + $i * 200) }
  Act-Done $sm 400
}
# 🦔 Bristles up — and little apples and maple leaves pop onto the tips of its spikes, then drop off.
function Act-Hedgehog($sm) {
  $u = $sm.u; $sm.acting = $true
  $sm.sc.BeginAnimation([Windows.Media.ScaleTransform]::ScaleYProperty, (Sn-Keys @(1, 0.88, 1.08, 1) @(0, 200, 330, 450)))
  $tips = @(1, 3, 5, 7); $j = 0
  foreach ($i in $tips) {
    $a = [Math]::PI * (0.05 + 0.9 * $i / 8); $ix = 16 - [Math]::Cos($a) * 11.5 + 2; $iy = 9 - [Math]::Sin($a) * 8 + 6
    $p = Sn-Img $(if ($j % 2) { 'leaf' } else { 'apple' }) $u; if (-not $p) { break }
    $x = ($ix - 18) * $u; $y = ($iy - 58) * $u
    Sn-Put2 $sm $p.img ($x - $p.img.Width / 2) ($y - $p.img.Height / 2); $p.img.Opacity = 0
    $t0 = 350 + $j * 120; $drop = -$y - 3 * $u; $t1 = 1300 + $j * 100
    Sn-Path $p @(0, 0, 0, 0, ($S.rnd.Next(-8, 9) * $u)) @((-6 * $u), (-6 * $u), 0, 0, $drop) @(0, $t0, ($t0 + 160), $t1, ($t1 + 400))
    $p.rot.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, (Sn-Keys @(0, 0, 200) @(0, $t1, ($t1 + 400))))
    Sn-Fade $p.img @(0, 0, 1, 1, 0) @(0, $t0, ($t0 + 100), ($t1 + 500), ($t1 + 750))
    After $t0 { param($q) Snow-Spark ($q[0].x + $q[1]) ($q[0].foot + $q[2]) 1 } @($sm, $x, $y)
    After ($t1 + 800) { param($q) $q[0].el.Children.Remove($q[1]) } @($sm, $p.img); $j++
  }
  Act-Done $sm 500
}
# One snowman for a pet of this kind, $size the pet's size: a Canvas whose (0, 0) is the feet.
function Snow-Make($kind, $size) {
  $pic = Snow-Pic $kind; if (-not $pic) { $pic = Snow-Pic 'cat' }; if (-not $pic) { return $null }
  # Whole pixels only (1x, 2x…): a pixel picture shrunk or stretched by a fraction smudges.
  $u = [Math]::Max(1, [Math]::Round($size / $SNOW_PX)); $iw = 36 * $u; $ih = 60 * $u
  $cv = New-Object Windows.Controls.Canvas
  $img = New-Object Windows.Controls.Image; $img.Width = $iw; $img.Height = $ih; $img.Stretch = 'Fill'; $img.Source = $pic
  [Windows.Media.RenderOptions]::SetBitmapScalingMode($img, 'NearestNeighbor')
  [Windows.Controls.Canvas]::SetLeft($img, -$iw / 2); [Windows.Controls.Canvas]::SetTop($img, -58 * $u); [void]$cv.Children.Add($img)
  $ht = 52 * $u # from the feet to the top of the hat
  if ($kind -eq 'parrot') {
    $b = New-Object Windows.Controls.Border; $b.Background = $conv.ConvertFrom('#F2FFFFFF'); $b.CornerRadius = 7; $b.Padding = New-Object Windows.Thickness 5, 1, 5, 2
    $b.BorderBrush = $conv.ConvertFrom('#55657E'); $b.BorderThickness = 1
    $t = New-Object Windows.Controls.TextBlock; $t.Text = '메리 크리스마스!'; $t.FontSize = 10; $t.FontWeight = 'Bold'; $t.FontFamily = New-Object Windows.Media.FontFamily 'Malgun Gothic'; $t.Foreground = $conv.ConvertFrom('#3A3550')
    $b.Child = $t; $b.Measure((New-Object Windows.Size ([double]::PositiveInfinity), ([double]::PositiveInfinity)))
    [Windows.Controls.Canvas]::SetLeft($b, -$b.DesiredSize.Width / 2); [Windows.Controls.Canvas]::SetTop($b, -$ht - $b.DesiredSize.Height - 4); [void]$cv.Children.Add($b)
  }
  # Whole-body movement (a waddle, a hop, a squash) and the rise, all about the feet.
  $p = @{ el = $cv; kind = $kind; ht = $ht; u = $u }
  if ($kind -eq 'parrot') { $p.bub = $b }
  $p.sc = New-Object Windows.Media.ScaleTransform 1, 0; $p.rot = New-Object Windows.Media.RotateTransform 0; $p.bob = New-Object Windows.Media.TranslateTransform
  $tg = New-Object Windows.Media.TransformGroup; foreach ($t in $p.sc, $p.rot, $p.bob) { $tg.Children.Add($t) }; $cv.RenderTransform = $tg
  Snow-Parts $p $kind $u $iw $ih
  $p
}
# A snowman stands up where the pet is: snow swirls in, then it pops up out of a puff.
function Snow-Rise($sm, $at, $delay = 0) {
  for ($i = 0; $i -lt 10; $i++) { $an = $i / 10 * 2 * [Math]::PI; $r = 46 + $S.rnd.Next(14)
    Fx-Go (Fx-Text '❄' (9 + $S.rnd.Next(5)) '#E6F4FF') ($at.x + [Math]::Cos($an) * $r - 5) ($at.foot - $sm.ht * 0.5 + [Math]::Sin($an) * $r * 0.6 - 6) (-[Math]::Cos($an) * $r) (-[Math]::Sin($an) * $r * 0.6) 420 $delay }
  $sm.el.Opacity = 0
  After ($delay + 380) { param($q) $sm = $q[0]; $at = $q[1]
    $sm.el.Opacity = 1
    $up = New-Object Windows.Media.Animation.BackEase; $up.Amplitude = 0.9
    Anim $sm.sc ([Windows.Media.ScaleTransform]::ScaleYProperty) 0 1 520 0 $up
    Anim $sm.sc ([Windows.Media.ScaleTransform]::ScaleXProperty) 1.35 1 520 0 $up
    Snow-Puff $at.x ($at.foot - 4) 9 30
    Snow-Spark $at.x ($at.foot - $sm.ht) 4 200
  } @($sm, $at)
}
function Snow-All {
  $now = Get-Date
  if (-not $S.snow) { $S.snow = @{ until = $now.AddMilliseconds($SNOW_MS); men = @{} } }
  else { $S.snow.until = $now.AddMilliseconds($SNOW_MS); foreach ($k in @($S.snow.men.Keys)) { if ($S.snow.men[$k].gone) { $S.snow.men.Remove($k) } } }
  # A flurry over the whole row first.
  for ($i = 0; $i -lt 16; $i++) { Fx-Go (Fx-Text '❄' (9 + $S.rnd.Next(9)) (Fx-Pick @('#FFFFFF', '#E6F4FF', '#CFE8FF'))) ($S.rnd.Next([int][Math]::Max(10, $S.fxw.Width - 10))) ($S.rnd.Next(60)) ($S.rnd.Next(-25, 26)) (110 + $S.rnd.Next(60)) 2200 ($i * 120) }
  Snow-Tick
}
# 🔥 The dragon breathes a flame up into the sky, and its own snow goes first.
function Dragon-Fire($sm) {
  $dir = Snow-In $sm.x; $mx = $sm.x + $dir * $sm.u * 2; $my = $sm.foot - 34 * $sm.u
  for ($i = 0; $i -lt 22; $i++) {
    $d = 6 + $S.rnd.Next(5) + $i * 0.35; $c = Fx-Pick @('#FFE066', '#FFB12E', '#FF7A2E', '#FF4A2E')
    Fx-Go (Snow-Dot $d $c) ($mx - $d / 2) ($my - $d / 2) ($dir * (4 + $S.rnd.Next(26)) + $S.rnd.Next(-8, 9)) (-60 - $S.rnd.Next(50)) (520 + $S.rnd.Next(200)) ($i * 40)
  }
  $t = Fx-Text '화르륵!' 15 '#FF6A2E'; $t.FontFamily = New-Object Windows.Media.FontFamily 'Malgun Gothic'; Fx-Go $t ($mx + $(if ($dir -lt 0) { -64 } else { 8 })) ($my - 20) ($dir * 10) -16 1000 100
  Snow-Puff $sm.x ($sm.foot - $sm.ht * 0.6) 6 22 300
}
function Snow-Melt($sm) {
  if ($sm.acting) { Act-Stop $sm }
  $sm.melting = $true; $sm.rot.Angle = 0; $sm.bob.X = 0; $sm.bob.Y = 0; $sm.sc.ScaleX = 1
  $wait = 0
  if ($sm.kind -eq 'dragon') { Dragon-Fire $sm; $wait = 700 }
  $ease = New-Object Windows.Media.Animation.QuadraticEase; $ease.EasingMode = 'EaseIn'
  Anim $sm.sc ([Windows.Media.ScaleTransform]::ScaleYProperty) 1 0.1 1200 $wait $ease
  Anim $sm.sc ([Windows.Media.ScaleTransform]::ScaleXProperty) 1 1.4 1200 $wait $ease
  Anim $sm.el ([Windows.UIElement]::OpacityProperty) 1 0 350 ($wait + 950) $null
  # Steam going up, drops coming down.
  for ($i = 0; $i -lt 5; $i++) { Fx-Go (Snow-Dot (7 + $S.rnd.Next(5)) '#D8E6F0') ($sm.x + $S.rnd.Next(-14, 10)) ($sm.foot - $sm.ht * 0.55) ($S.rnd.Next(-8, 9)) (-30 - $S.rnd.Next(18)) 800 ($wait + 150 + $i * 150) }
  for ($i = 0; $i -lt 7; $i++) { $d = New-Object Windows.Shapes.Ellipse; $d.Width = 3; $d.Height = 5; $d.Fill = $conv.ConvertFrom('#8CCBF0'); Fx-Go $d ($sm.x + $S.rnd.Next(-16, 17)) ($sm.foot - $sm.ht * 0.45) 0 ($sm.ht * 0.42) 450 ($wait + 150 + $i * 130) }
  $pd = New-Object Windows.Shapes.Ellipse; $pd.Width = $sm.u * 34; $pd.Height = $sm.u * 6; $pd.Fill = $conv.ConvertFrom('#998CCBF0'); $pd.Stroke = $conv.ConvertFrom('#AA5FA8D8'); $pd.StrokeThickness = 1
  $pd.Opacity = 0; Fx-Add $pd ($sm.x - $pd.Width / 2) ($sm.foot - $pd.Height / 2)
  Anim $pd ([Windows.UIElement]::OpacityProperty) 0 1 400 ($wait + 500) $null; After ($wait + 1500) { param($pd) Anim $pd ([Windows.UIElement]::OpacityProperty) 1 0 900 0 $null; Fx-Drop $pd 950 } $pd
  After ($wait + 1250) { param($sm)
    $S.fxc.Children.Remove($sm.el); $sm.gone = $true
    $hm = $S.members[$sm.key]
    if ($hm -and -not ($S.stage -and @($S.stage.dancers | Where-Object { $_.key -eq $sm.key }).Count) -and -not $S.frozen[$sm.key]) { $hm.img.Visibility = 'Visible'; Pop $hm.img 0 14; Snow-Spark $sm.x ($sm.foot - 20) 3 }
  } $sm
}
# Every animation tick (0.2 s) while there are snowmen: new arrivals on the row, where each
# stands now (the row moves), snow falling on them, each one's own little thing, the melting.
function Snow-Tick {
  $sn = $S.snow; if (-not $sn -or -not $S.fxw -or -not $w.IsVisible) { return }
  $now = Get-Date; $live = 0; $n = 0
  foreach ($k in @($S.members.Keys)) {
    $m = $S.members[$k]; if (-not $m -or -not $m.img.ActualWidth) { continue }
    $sm = $sn.men[$k]
    if (-not $sm) {
      if ($now -gt $sn.until.AddMilliseconds(-1500)) { continue }
      if ($S.stage -and @($S.stage.dancers | Where-Object { $_.key -eq $k }).Count) { continue }
      $fz = $S.frozen[$k]; if ($fz) { $S.fxc.Children.Remove($fz.sm.el); $S.frozen.Remove($k) }
      $at = Fx-At $m; $sm = Snow-Make $m.kind $at.size; if (-not $sm) { continue }
      $sm.key = $k; $sm.size = $at.size; $sm.x = $at.x; $sm.foot = $at.foot; $sm.born = $now; $sm.melting = $false; $sm.gone = $false
      Fx-Add $sm.el $at.x $at.foot; $sn.men[$k] = $sm; $m.img.Visibility = 'Hidden'
      Snow-Rise $sm $at ($n * 90); $n++
    }
    if ($sm.gone) { continue }
    $live++
    if ($sm.melting) { continue }
    $m.img.Visibility = 'Hidden'
    $at = Fx-At $m; $sm.x = $at.x; $sm.foot = $at.foot
    [Windows.Controls.Canvas]::SetLeft($sm.el, $at.x); [Windows.Controls.Canvas]::SetTop($sm.el, $at.foot)
    if (($now - $sm.born).TotalMilliseconds -lt 1000) { continue } # still coming up
    $tk = $S.tick
    # Snow keeps falling on it, and now and then a glint.
    if ($S.rnd.Next(3) -eq 0) { Fx-Go (Fx-Text '❄' (7 + $S.rnd.Next(4)) '#EAF6FF') ($sm.x + $S.rnd.Next(-26, 22)) ($sm.foot - $sm.ht - 18) ($S.rnd.Next(-6, 7)) (34 + $S.rnd.Next(20)) 1100 0 }
    if ($S.rnd.Next(9) -eq 0) { Snow-Spark $sm.x ($sm.foot - $sm.ht * 0.6) 1 }
    if (-not $sm.acted -and ($now - $sm.born).TotalMilliseconds -gt 1300) { Snow-Act $sm }
    if (-not $sm.acting) { switch ($sm.kind) {
      { $_ -in 'duck', 'chick' } { $sm.rot.Angle = @(-5, 0, 5, 0)[$tk % 4] }
      'penguin' { $sm.rot.Angle = @(-4, 0, 4, 0)[$tk % 4] }
      { $_ -in 'dog', 'cat', 'fox', 'tiger' } { $sm.rot.Angle = $(if ($tk % 10 -lt 2) { @(-4, 4)[$tk % 2] } else { 0 }) }
      { $_ -in 'rabbit', 'frog', 'horse', 'monkey', 'mouse' } { $sm.bob.Y = $(if ($tk % 8 -eq 0) { -7 } elseif ($tk % 8 -eq 1) { -3 } else { 0 }) }
      'hamster' { $sm.sc.ScaleX = $(if ($tk % 10 -lt 3) { 1.1 } else { 1 }) }
      'shark' { if ($tk % 4 -eq 0) { $sm.sc.ScaleX = -$sm.sc.ScaleX } }
      'ox' { $sm.rot.Angle = @(-3, 0, 3, 0)[$tk % 4] }
      default { $sm.bob.X = $(if ($tk % 12 -lt 2) { @(-1, 1)[$tk % 2] } else { 0 }) }
    } }
    # The penguin jumps for joy, hearts and all, while the others melt.
    if ($sm.kind -eq 'penguin' -and -not $sm.acting -and @($sn.men.Values | Where-Object { $_.melting -and -not $_.gone }).Count) {
      $sm.bob.Y = @(-8, 0)[$tk % 2]
      if ($tk % 2 -eq 0) { Fx-Go (Fx-Text '♥' (11 + $S.rnd.Next(5)) '#FF7A9A') ($sm.x + $S.rnd.Next(-12, 8)) ($sm.foot - $sm.ht - 6) ($S.rnd.Next(-8, 9)) -30 900 0 }
    }
    if ($now -gt $sn.until.AddMilliseconds([int]$SNOW_LATE[$m.kind])) { Snow-Melt $sm }
  }
  # Snowmen of pets no longer on the row go as they are.
  foreach ($k in @($sn.men.Keys)) { if (-not $S.members[$k] -and -not $sn.men[$k].gone) { $S.fxc.Children.Remove($sn.men[$k].el); $sn.men[$k].gone = $true } }
  if (-not $live -and $now -gt $sn.until) { $S.snow = $null }
}
# ❄️ 눈덩이 (the hub's /api/snowball): from someone's pet a snowball flies in an arc to another's,
# leaving a trail of snow; where it hits, snow bursts in a ring with a 퍽, and the one hit stands
# frozen as its snowman for FREEZE_MS, shivering, then shakes the snow off and is itself again.
# Hit again meanwhile, the clock starts over. On every screen of the floor.
$FREEZE_MS = 5000
function Snowball-Do($body) {
  if ($S.sbAim -or -not $S.fxw -or -not $w.IsVisible) { return }
  $me = $S.members['']; if (-not $me -or -not $me.img.ActualWidth) { return }
  Place-Fx; $at = Fx-At $me
  # The timing bar over my pet: a snowflake runs back and forth; the blue part in the middle hits.
  $bw = 100; $zone = 20; $el = New-Object Windows.Controls.Canvas
  $bg = New-Object Windows.Controls.Border; $bg.Width = $bw + 8; $bg.Height = 18; $bg.CornerRadius = 9; $bg.Background = $conv.ConvertFrom('#E61E1B2E'); $bg.BorderBrush = $conv.ConvertFrom('#9FD3F2'); $bg.BorderThickness = 1.5
  [void](Sn-Put $el $bg -4 -3)
  $zr = New-Object Windows.Shapes.Rectangle; $zr.Width = $zone; $zr.Height = 12; $zr.RadiusX = 3; $zr.RadiusY = 3; $zr.Fill = $conv.ConvertFrom('#5FB3DD'); [void](Sn-Put $el $zr (($bw - $zone) / 2) 0)
  $mk = Fx-Text '❄' 15 '#FFFFFF'; $mt = New-Object Windows.Media.TranslateTransform; $mk.RenderTransform = $mt; [void](Sn-Put $el $mk -6 -5)
  $lb = Fx-Text '파란 칸에서 클릭!' 11 '#CFEFFF'; $lb.FontFamily = New-Object Windows.Media.FontFamily 'Malgun Gothic'; [void](Sn-Put $el $lb 8 -22)
  $x0 = [Math]::Max(4, [Math]::Min($S.fxw.Width - $bw - 8, $at.x - $bw / 2)); Fx-Add $el $x0 ($at.y - 44)
  $run = New-Object Windows.Media.Animation.DoubleAnimation 0, $bw, (New-Object Windows.Duration ([TimeSpan]::FromMilliseconds(520)))
  $run.AutoReverse = $true; $run.RepeatBehavior = [Windows.Media.Animation.RepeatBehavior]::Forever; $mt.BeginAnimation([Windows.Media.TranslateTransform]::XProperty, $run)
  # The click (or Space): an empty window over the monitor, on top for a moment, like the 날려버리기 aim.
  $ar = Smk-Area; $cw = New-Object Windows.Window; $cw.WindowStyle = 'None'; $cw.AllowsTransparency = $true; $cw.Background = $conv.ConvertFrom('#01000000')
  $cw.Topmost = $true; $cw.ShowInTaskbar = $false; $cw.ResizeMode = 'NoResize'; $cw.Cursor = [Windows.Input.Cursors]::Hand
  $cw.Left = $ar.l; $cw.Top = $ar.t; $cw.Width = $ar.wd; $cw.Height = $ar.ht
  $S.sbAim = @{ el = $el; mt = $mt; bw = $bw; zone = $zone; body = $body; win = $cw }
  $cw.Add_MouseLeftButtonDown({ Snowball-Let }); $cw.Add_MouseRightButtonDown({ Snowball-Let $true })
  $cw.Add_KeyDown({ param($o, $ev) if ($ev.Key -eq 'Space' -or $ev.Key -eq 'Return') { Snowball-Let } elseif ($ev.Key -eq 'Escape') { Snowball-Let $true } })
  $cw.Show(); [void]$cw.Activate()
  # Nothing pressed: it goes anyway, wide.
  After 2500 { param($a0) if ($S.sbAim -eq $a0) { Snowball-Let } } $S.sbAim
}
function Sn-Put($cv, $el, $x, $y) { [Windows.Controls.Canvas]::SetLeft($el, $x); [Windows.Controls.Canvas]::SetTop($el, $y); [void]$cv.Children.Add($el); $el }
# Let go: where the snowflake is now decides it (a hit in the blue part); Esc or right click stops.
function Snowball-Let($stop = $false) {
  $a0 = $S.sbAim; if (-not $a0) { return }; $S.sbAim = $null
  $pos = $a0.mt.X; $a0.mt.BeginAnimation([Windows.Media.TranslateTransform]::XProperty, $null)
  try { $a0.win.Close() } catch {}
  $S.fxc.Children.Remove($a0.el)
  if ($stop) { return }
  $hit = [Math]::Abs($pos - $a0.bw / 2) -le $a0.zone / 2 + 1
  $r = Ask '/api/snowball' @{ to = $a0.body.to; floor = $a0.body.floor; hit = $hit }
  if ($r.error) { Say $S.members[''] '❄️' "⚠ $($r.error)" 3 }
}
# A throw on this screen. A miss just goes. A hit comes in two steps from the hub: 'aim' — the
# thrower winds up and holds, a ❗ over the one aimed at; on their own screen a ring closes in and
# a click on their pet just before it lands dodges (they judge it, Sb-Mine) — then 'end', how it
# went: the ball goes, and hits or flies under the pet that jumped.
function Snowball($akey, $f) {
  if (-not $f -or -not $f.to) { return }
  if (-not $S.sbFly) { $S.sbFly = @{} }
  $tk = $(if ($f.me) { '' } else { "$($f.floor)|$($f.to)" })
  if ($f.phase -eq 'end') {
    $st = $S.sbFly[$f.id]; if ($st) { $S.sbFly.Remove($f.id) }
    if ($st -and $st.me) {
      # The hub's word came before the ball left here (both in one late poll, or it stopped waiting
      # for me): put the dodge away and show how it went, or every click on my pet stays a dodge.
      if (-not $st.gone) { if ($S.sbDodge -eq $st) { $S.sbDodge = $null }; Sb-Clear $st; $st.me = $false; Sb-Let $st ([bool]$f.hit) ([bool]$f.dodged) }
      return
    }
    if ($st) { Sb-Let $st ([bool]$f.hit) ([bool]$f.dodged); return }
  }
  $st = Sb-Plan $akey $tk
  if (-not $st) {
    # My pet is not up to see it coming: it hits.
    if ($f.phase -eq 'aim' -and $f.me) { [void](Ask '/api/snowball' @{ op = 'end'; id = $f.id; dodged = $false; floor = $f.floor }) }
    return
  }
  if ($f.phase -eq 'aim') {
    $st.id = $f.id; $st.me = [bool]$f.me; $st.floor = $f.floor; $S.sbFly[$f.id] = $st
    Sb-Wind $st; Sb-Warn $st
    if ($st.me) { Sb-Mine $st ([int]$f.warn) ([int]$f.fly) }
    else { After 10000 { param($st) if ($S.sbFly[$st.id] -eq $st) { $S.sbFly.Remove($st.id); Sb-Clear $st } } $st }
    return
  }
  # A miss, or how it went when the 'aim' never showed here: the plain throw.
  Sb-Wind $st; After 240 { param($z) Sb-Let $z[0] $z[1] $z[2] } @($st, ([bool]$f.hit), ([bool]$f.dodged))
}
function Sb-Plan($akey, $tk) {
  $ma = $S.members[$akey]; $mb = $S.members[$tk]
  if (-not $mb -or -not $mb.img.ActualWidth -or $mb.img.Visibility -ne 'Visible') { return $null }
  $b = Fx-At $mb
  $own = [bool]($ma -and $ma.img.ActualWidth -and $akey -ne $tk -and $ma.img.Visibility -eq 'Visible')
  $a = $(if ($own) { Fx-At $ma } else { @{ x = $b.x - 140 * (-(Snow-In $b.x)); y = $b.y - 10; size = $b.size } })
  @{ ma = $ma; mb = $mb; tk = $tk; own = $own; a = $a; b = $b; dir = $(if ($b.x -ge $a.x) { 1 } else { -1 }); me = $false }
}
# Key frames for one property: values at times (ms), eased in between.
function Sn-Keys($vals, $times) {
  $k = New-Object Windows.Media.Animation.DoubleAnimationUsingKeyFrames
  $k.Duration = New-Object Windows.Duration ([TimeSpan]::FromMilliseconds($times[-1]))
  $e = New-Object Windows.Media.Animation.QuadraticEase; $e.EasingMode = 'EaseOut'
  for ($i = 0; $i -lt $vals.Count; $i++) {
    $kf = New-Object Windows.Media.Animation.EasingDoubleKeyFrame $vals[$i], ([Windows.Media.Animation.KeyTime]::FromTimeSpan([TimeSpan]::FromMilliseconds($times[$i]))), $e
    [void]$k.KeyFrames.Add($kf)
  }
  $k
}
# The wind-up: lean back, the ball held up behind the head, and stay so until Sb-Let.
function Sb-Wind($st) {
  if (-not $st.own) { return }
  $img = $st.ma.img; $dir = $st.dir; $a = $st.a
  $sq = New-Object Windows.Media.ScaleTransform 1, 1; $rot = New-Object Windows.Media.RotateTransform 0; $mv = New-Object Windows.Media.TranslateTransform
  $tg = New-Object Windows.Media.TransformGroup; foreach ($t in $sq, $rot, $mv) { $tg.Children.Add($t) }
  $img.RenderTransformOrigin = New-Object Windows.Point 0.5, 1; $img.RenderTransform = $tg
  Anim $rot ([Windows.Media.RotateTransform]::AngleProperty) 0 (-$dir * 17) 160 0 $null
  Anim $mv ([Windows.Media.TranslateTransform]::XProperty) 0 (-$dir * 4) 160 0 $null
  Anim $sq ([Windows.Media.ScaleTransform]::ScaleYProperty) 1 0.89 160 0 $null
  Anim $sq ([Windows.Media.ScaleTransform]::ScaleXProperty) 1 1.07 160 0 $null
  $hb = Snow-Dot 11 '#F6F9FF' '#55657E'; $hb.StrokeThickness = 1.3
  $ht = New-Object Windows.Media.TranslateTransform; $hb.RenderTransform = $ht
  Fx-Add $hb ($a.x - $dir * $a.size * 0.45 - 5) ($a.y - 2)
  Anim $ht ([Windows.Media.TranslateTransform]::YProperty) 0 -7 200 0 $null
  Anim $ht ([Windows.Media.TranslateTransform]::XProperty) 0 (-$dir * 3) 200 0 $null
  $st.rot = $rot; $st.mv = $mv; $st.sq = $sq; $st.hb = $hb
}
# ❗ over the one aimed at, bobbing, until it goes.
function Sb-Warn($st) {
  $b = $st.b; $t = Fx-Text '❗' 16 '#FF5A5A'; $tt = New-Object Windows.Media.TranslateTransform; $t.RenderTransform = $tt
  Fx-Add $t ($b.x - 7) ($b.y - 26)
  $bo = New-Object Windows.Media.Animation.DoubleAnimation 0, -5, (New-Object Windows.Duration ([TimeSpan]::FromMilliseconds(220)))
  $bo.AutoReverse = $true; $bo.RepeatBehavior = [Windows.Media.Animation.RepeatBehavior]::Forever
  $tt.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, $bo); $st.warn = $t
}
function Sb-Clear($st) {
  foreach ($e in $st.hb, $st.warn, $st.ring, $st.hint) { if ($e) { $S.fxc.Children.Remove($e) } }
  $st.hb = $null; $st.warn = $null; $st.ring = $null; $st.hint = $null
  if ($st.own -and $st.rot) { $st.ma.img.RenderTransform = $null; $st.rot = $null }
}
# Let it go: snap forward, the ball leaves on the snap.
function Sb-Let($st, $hit, $dodged) {
  $st.gone = $true
  foreach ($e in $st.hb, $st.warn) { if ($e) { $S.fxc.Children.Remove($e) } }; $st.hb = $null; $st.warn = $null
  if ($st.own -and $st.rot) {
    $dir = $st.dir; $tm = @(0, 80, 330)
    $st.rot.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, (Sn-Keys @((-$dir * 17), ($dir * 14), 0) $tm))
    $st.mv.BeginAnimation([Windows.Media.TranslateTransform]::XProperty, (Sn-Keys @((-$dir * 4), ($dir * 6), 0) $tm))
    $st.sq.BeginAnimation([Windows.Media.ScaleTransform]::ScaleYProperty, (Sn-Keys @(0.89, 1.08, 1) $tm))
    $st.sq.BeginAnimation([Windows.Media.ScaleTransform]::ScaleXProperty, (Sn-Keys @(1.07, 0.94, 1) $tm))
    After 380 { param($i) $i.RenderTransform = $null } $st.ma.img; $st.rot = $null
  }
  Snow-Fly @{ a = $st.a; b = $st.b; tk = $st.tk; mb = $st.mb; hit = $hit; dodge = $dodged; dir = $st.dir; st = $(if ($st.me) { $st } else { $null }); ms = $st.flyMs }
}
# On my own screen, aimed at me: a ring closes in on my pet; when it turns gold (the ball is on its
# way and nearly here), a click on my pet jumps it. Too early, and the jump is spent.
function Sb-Mine($st, $warn, $fly) {
  if ($warn -le 0) { $warn = 1000 }; if ($fly -le 0) { $fly = 350 }
  $st.t0 = Get-Date; $st.flyMs = $fly; $st.win0 = $warn + $fly - 330; $st.win1 = $warn + $fly - 20; $st.pressed = $false; $st.dodged = $false
  $S.sbDodge = $st
  $b = $st.b; $d = $b.size * 1.15
  $ring = New-Object Windows.Shapes.Ellipse; $ring.Width = $d; $ring.Height = $d; $ring.Stroke = $conv.ConvertFrom('#9FD3F2'); $ring.StrokeThickness = 2.5
  $rs = New-Object Windows.Media.ScaleTransform 2.6, 2.6, ($d / 2), ($d / 2); $ring.RenderTransform = $rs
  Fx-Add $ring ($b.x - $d / 2) ($b.y + $b.size / 2 - $d / 2)
  Anim $rs ([Windows.Media.ScaleTransform]::ScaleXProperty) 2.6 1 ($warn + $fly) 0 $null; Anim $rs ([Windows.Media.ScaleTransform]::ScaleYProperty) 2.6 1 ($warn + $fly) 0 $null
  $st.ring = $ring
  $h = Fx-Text '내 펫을 눌러 피하기!' 11 '#CFEFFF'; $h.FontFamily = New-Object Windows.Media.FontFamily 'Malgun Gothic'
  Fx-Add $h ([Math]::Max(4, [Math]::Min($S.fxw.Width - 110, $b.x - 52))) ($b.y - 48); $st.hint = $h
  After $st.win0 { param($st) if ($st.ring -and -not $st.pressed) { $st.ring.Stroke = $conv.ConvertFrom('#FFD84A'); $st.ring.StrokeThickness = 3.5 } } $st
  After $warn { param($st) if ($S.sbFly[$st.id] -eq $st) { Sb-Let $st $true $false } } $st
}
# The click on my pet while a ball is coming at me.
function Sb-Dodge {
  $st = $S.sbDodge; if (-not $st -or $st.pressed) { return }
  $st.pressed = $true; $el = ((Get-Date) - $st.t0).TotalMilliseconds
  $st.dodged = $el -ge $st.win0 -and $el -le $st.win1
  if ($st.ring) { $st.ring.Stroke = $conv.ConvertFrom($(if ($st.dodged) { '#7CF29A' } else { '#FF7A7A' })) }
  Sb-Hop $st.mb $st.dodged
}
# Up it goes: high and turning when it dodges (the ball flies under), a little hop when too early.
function Sb-Hop($m, $big) {
  if (-not $m -or -not $m.img.ActualWidth) { return }
  $img = $m.img; $sz = $img.ActualHeight
  $mv = New-Object Windows.Media.TranslateTransform; $rot = New-Object Windows.Media.RotateTransform 0
  $tg = New-Object Windows.Media.TransformGroup; $tg.Children.Add($rot); $tg.Children.Add($mv)
  $img.RenderTransformOrigin = New-Object Windows.Point 0.5, 0.5; $img.RenderTransform = $tg
  if ($big) {
    $mv.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, (Sn-Keys @(0, (-$sz * 1.1), (-$sz * 1.1), 0) @(0, 150, 400, 600)))
    Anim $rot ([Windows.Media.RotateTransform]::AngleProperty) 0 360 450 100 $null
    After 650 { param($i) $i.RenderTransform = $null } $img
  } else {
    $mv.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, (Sn-Keys @(0, (-$sz * 0.35), 0) @(0, 120, 260)))
    After 300 { param($i) $i.RenderTransform = $null } $img
  }
}
function Snow-Ball {
  $el = New-Object Windows.Controls.Canvas; $el.Width = 12; $el.Height = 12
  $o = Snow-Dot 12 '#F6F9FF' '#55657E'; $o.StrokeThickness = 1.5; [void]$el.Children.Add($o)
  # A crease of darker snow, so the spin shows.
  $c = Snow-Dot 4 '#B8C7DC'; [Windows.Controls.Canvas]::SetLeft($c, 2); [Windows.Controls.Canvas]::SetTop($c, 3); [void]$el.Children.Add($c)
  $rot = New-Object Windows.Media.RotateTransform 0; $mv = New-Object Windows.Media.TranslateTransform
  $tg = New-Object Windows.Media.TransformGroup; $tg.Children.Add($rot); $tg.Children.Add($mv)
  $el.RenderTransformOrigin = New-Object Windows.Point 0.5, 0.5; $el.RenderTransform = $tg
  @{ el = $el; rot = $rot; mv = $mv }
}
# Low and fast: barely lifts, straight in.
function Snow-Fly($q) {
  $a = $q.a; $b = $q.b; $dir = $q.dir
  $sx = $a.x + $dir * $a.size * 0.35; $sy = $a.y + $a.size * 0.2
  $ex = $b.x - $dir * $b.size * 0.15; $ey = $b.y + $b.size * 0.3
  if (-not $q.hit -and -not $q.dodge -and -not $q.st) { $ex = $b.x - $dir * $b.size * 0.9; $ey = $b.foot - 2 }
  $dx = $ex - $sx; $dy = $ey - $sy; $dist = [Math]::Sqrt($dx * $dx + $dy * $dy)
  $ms = $(if ($q.ms) { [int]$q.ms } else { [int][Math]::Max(220, [Math]::Min(420, 160 + $dist * 0.45)) }); $hi = 12
  $bl = Snow-Ball; Fx-Add $bl.el ($sx - 6) ($sy - 6)
  $kx = New-Object Windows.Media.Animation.DoubleAnimationUsingKeyFrames; $ky = New-Object Windows.Media.Animation.DoubleAnimationUsingKeyFrames
  foreach ($kf in $kx, $ky) { $kf.Duration = New-Object Windows.Duration ([TimeSpan]::FromMilliseconds($ms)) }
  for ($i = 1; $i -le 8; $i++) {
    $u = $i / 8; $px = $dx * $u; $py = $dy * $u - $hi * 4 * $u * (1 - $u); $kt = [Windows.Media.Animation.KeyTime]::FromTimeSpan([TimeSpan]::FromMilliseconds($ms * $u))
    [void]$kx.KeyFrames.Add((New-Object Windows.Media.Animation.LinearDoubleKeyFrame ($px, $kt))); [void]$ky.KeyFrames.Add((New-Object Windows.Media.Animation.LinearDoubleKeyFrame ($py, $kt)))
    # A short streak behind it, gone fast.
    if ($i -lt 8) { Fx-Go (Snow-Dot (2 + $S.rnd.Next(3)) '#FFFFFF' '#C9D6E8') ($sx + $px - 2) ($sy + $py - 2) (-$dir * 4) 2 220 ($ms * $u) }
  }
  $bl.mv.BeginAnimation([Windows.Media.TranslateTransform]::XProperty, $kx); $bl.mv.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, $ky)
  Anim $bl.rot ([Windows.Media.RotateTransform]::AngleProperty) 0 ($dir * 540) $ms 0 $null
  # Dodged, seen from another screen: the pet jumps just as it comes.
  if ($q.dodge -and -not $q.st) { After ([Math]::Max(10, $ms - 170)) { param($m) Sb-Hop $m $true } $q.mb }
  $q.bl = $bl; $q.ex = $ex; $q.ey = $ey; $q.dx = $dx; $q.dy = $dy
  After $ms { param($q) Snow-Land $q } $q
}
function Snow-Land($q) {
  $bl = $q.bl
  if ($q.st) {
    # Aimed at me: how it went is mine to say.
    $st = $q.st; if ($S.sbDodge -eq $st) { $S.sbDodge = $null }
    Sb-Clear $st; $q.dodge = [bool]$st.dodged; $q.hit = -not $q.dodge
    [void](Ask '/api/snowball' @{ op = 'end'; id = $st.id; dodged = $q.dodge; floor = $st.floor })
  }
  if ($q.dodge) {
    # Under the pet and on, gone.
    $bl.mv.BeginAnimation([Windows.Media.TranslateTransform]::XProperty, (Sn-Keys @($q.dx, ($q.dx + $q.dir * 70)) @(0, 300)))
    $bl.mv.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, (Sn-Keys @($q.dy, ($q.dy + 6)) @(0, 300)))
    Anim $bl.el ([Windows.UIElement]::OpacityProperty) 1 0 300 0 $null; Fx-Drop $bl.el 320
    $t = Fx-Text '휙!' 15 '#9FD3F2'; $t.FontFamily = New-Object Windows.Media.FontFamily 'Malgun Gothic'
    $d = Snow-In $q.b.x; Fx-Go $t ($q.b.x + $(if ($d -lt 0) { -40 } else { 8 })) ($q.b.y - 34) ($d * 6) -16 800 0
    return
  }
  $S.fxc.Children.Remove($bl.el)
  if ($q.hit) { Snow-Hit $q.tk } else { Snow-Miss $q.ex $q.ey }
}
# A miss: snow bursts up off the ground at the feet.
function Snow-Miss($x, $y) {
  for ($i = 0; $i -lt 9; $i++) { $an = [Math]::PI * (1 + $i / 8); Fx-Go (Snow-Dot (3 + $S.rnd.Next(3)) '#FFFFFF' '#AFC0D8') $x ($y - 3) ([Math]::Cos($an) * (14 + $S.rnd.Next(10))) ([Math]::Sin($an) * 12) 500 0 }
  $t = Fx-Text '빗나갔다!' 13 '#8FA6C4'; $t.FontFamily = New-Object Windows.Media.FontFamily 'Malgun Gothic'
  $dir = Snow-In $x; Fx-Go $t ($x + $(if ($dir -lt 0) { -64 } else { 6 })) ($y - 30) ($dir * 6) -14 900 0
}
function Snow-Hit($tk) {
  $mb = $S.members[$tk]; if (-not $mb -or -not $mb.img.ActualWidth) { return }
  $b = Fx-At $mb; $hy = $b.y + $b.size * 0.3
  for ($i = 0; $i -lt 16; $i++) { $an = $i / 16 * 2 * [Math]::PI + $S.rnd.NextDouble() * 0.3; $sz = 3 + $S.rnd.Next(5); Fx-Go (Snow-Dot $sz '#FFFFFF' '#AFC0D8') ($b.x - $sz / 2) $hy ([Math]::Cos($an) * (22 + $S.rnd.Next(18))) ([Math]::Sin($an) * 16 + 12) 650 0 }
  $ring = New-Object Windows.Shapes.Ellipse; $ring.Stroke = [Windows.Media.Brushes]::White; $ring.StrokeThickness = 2; $ring.Width = 44; $ring.Height = 26
  $rs = New-Object Windows.Media.ScaleTransform 0.2, 0.2, 22, 13; $ring.RenderTransform = $rs; Fx-Add $ring ($b.x - 22) ($hy - 13)
  Anim $rs ([Windows.Media.ScaleTransform]::ScaleXProperty) 0.2 1.2 350 0 $null; Anim $rs ([Windows.Media.ScaleTransform]::ScaleYProperty) 0.2 1.2 350 0 $null
  Anim $ring ([Windows.UIElement]::OpacityProperty) 1 0 350 0 $null; Fx-Drop $ring 400
  $pk = Fx-Text '퍽!' 17 '#5F7FA8'; $pk.FontFamily = New-Object Windows.Media.FontFamily 'Malgun Gothic'
  $dir = Snow-In $b.x; Fx-Go $pk ($b.x + $(if ($dir -lt 0) { -40 } else { 8 })) ($hy - 30) ($dir * 6) -18 850 0
  # Already a snowman (/눈사람 going on): only the burst.
  if ($S.snow -and $S.snow.men[$tk] -and -not $S.snow.men[$tk].gone) { return }
  $fz = $S.frozen[$tk]
  if ($fz) { $fz.until = (Get-Date).AddMilliseconds($FREEZE_MS); return }
  $sm = Snow-Make $mb.kind $b.size; if (-not $sm) { return }
  $sm.key = $tk; $sm.size = $b.size; $sm.x = $b.x; $sm.foot = $b.foot
  Fx-Add $sm.el $b.x $b.foot; $mb.img.Visibility = 'Hidden'
  $pop = New-Object Windows.Media.Animation.BackEase; $pop.Amplitude = 0.9
  Anim $sm.sc ([Windows.Media.ScaleTransform]::ScaleYProperty) 0 1 350 0 $pop; Anim $sm.sc ([Windows.Media.ScaleTransform]::ScaleXProperty) 1.4 1 350 0 $pop
  Snow-Puff $b.x ($b.foot - 4) 7 26
  After 1000 { param($sm) $fz = $S.frozen[$sm.key]; if ($fz -and $fz.sm -eq $sm) { Snow-Act $sm } } $sm
  $S.frozen[$tk] = @{ sm = $sm; until = (Get-Date).AddMilliseconds($FREEZE_MS) }
  After 250 { param($t) Crowd-Dance $t } $tk
}
# A snowman made: everyone else on the row gets up and dances round it (the one who threw too).
function Crowd-Dance($skip) {
  if (-not $S.fxw -or -not $w.IsVisible) { return }
  foreach ($k in @($S.members.Keys)) {
    if ($k -eq $skip -or $S.frozen[$k]) { continue }
    $m = $S.members[$k]; if ($m -and $m.img.ActualWidth -and $m.img.Visibility -eq 'Visible') { Dance $k (Fx-At $m) }
  }
}
# Every animation tick: the frozen ones shiver where their pets stand, then shake it all off.
function Freeze-Tick {
  if (-not $S.frozen.Count) { return }
  $now = Get-Date
  foreach ($k in @($S.frozen.Keys)) {
    $fz = $S.frozen[$k]; $sm = $fz.sm; $m = $S.members[$k]
    if (-not $m -or -not $m.img.ActualWidth -or -not $S.fxw -or -not $w.IsVisible) { $S.fxc.Children.Remove($sm.el); $S.frozen.Remove($k); if ($m) { $m.img.Visibility = 'Visible' }; continue }
    $at = Fx-At $m; $sm.x = $at.x; $sm.foot = $at.foot
    [Windows.Controls.Canvas]::SetLeft($sm.el, $at.x); [Windows.Controls.Canvas]::SetTop($sm.el, $at.foot)
    $m.img.Visibility = 'Hidden'; $sm.bob.X = @(-1.5, 1.5)[$S.tick % 2]
    if ($S.rnd.Next(4) -eq 0) { Fx-Go (Fx-Text '❄' 8 '#DDF0FF') ($at.x + $S.rnd.Next(-20, 16)) ($at.foot - $sm.ht * 0.8) ($S.rnd.Next(-10, 11)) 18 700 0 }
    if ($now -lt $fz.until) { continue }
    # Shaken off: snow flies out every way and the pet hops back.
    $S.frozen.Remove($k); $S.fxc.Children.Remove($sm.el)
    for ($i = 0; $i -lt 16; $i++) { $an = $i / 16 * 2 * [Math]::PI; Fx-Go (Snow-Dot (3 + $S.rnd.Next(4)) '#FFFFFF' '#AFC0D8') $at.x ($at.foot - $sm.ht * 0.5) ([Math]::Cos($an) * 34) ([Math]::Sin($an) * 22) 550 0 }
    Snow-Puff $at.x ($at.foot - 6) 6 24
    $m.img.Visibility = 'Visible'; Pop $m.img 0 12
  }
}
# 🎣 낚시 (server/fish.js): /낚시 or the menu casts from my pet into a little pond at its feet.
# The bobber floats, nibbles now and then, and when the hub's bite comes it sinks and a ❗ jumps
# over my head: a click on my pet within a moment hooks it, and then the fight: a click when the
# marker on the bar over my head is in its green part lands it (the rarer, the harder). The catch leaps out of the water to
# over my head with its name and size; a rare one is said on the floor and leaps over me on
# everyone's row too. Friends with a line in the water hold a rod on my row.
$S.fish = $null; $S.looks = $null; $S.geo = @{}; $S.rods = @{}; $S.book = $null; $S.bookPick = $null
function Fish-Looks {
  if (-not $S.looks) { $r = Call '/api/fish-looks'; if ($r -and $r.looks) { $S.looks = $r.looks } }
  $S.looks
}
# One catch drawn from the hub's shapes (server/fish-art.js), $wd wide; the parsed outlines are
# kept per fish, so a second drawing (the book) is quick. A shadow: one flat colour, no pattern.
function Fish-Visual($id, $wd, $shadow = $false) {
  if (-not $S.geo.ContainsKey($id)) {
    $lk = (Fish-Looks).$id; if (-not $lk) { return $null }
    $clips = @($lk.clips | ForEach-Object { $g = [Windows.Media.Geometry]::Parse($_); $g.Freeze(); $g })
    $S.geo[$id] = @($lk.parts | ForEach-Object { $g = [Windows.Media.Geometry]::Parse($_.d); $g.Freeze()
      @{ g = $g; fill = $_.fill; stroke = $_.stroke; w = $_.w; op = $_.op; clip = $(if ($null -ne $_.clip) { $clips[$_.clip] } else { $null }) } })
  }
  $cv = New-Object Windows.Controls.Canvas; $cv.Width = 120; $cv.Height = 80
  foreach ($p in $S.geo[$id]) {
    if ($shadow -and ($p.clip -or ($null -ne $p.op -and $p.op -lt 1))) { continue }
    $pa = New-Object Windows.Shapes.Path; $pa.Data = $p.g
    if ($shadow) {
      if ($p.fill) { $pa.Fill = $conv.ConvertFrom('#3A3454') }
      if ($p.stroke) { $pa.Stroke = $conv.ConvertFrom('#3A3454'); $pa.StrokeThickness = $(if ($p.w) { $p.w } else { 1.6 }) }
    } else {
      if ($p.fill) { $pa.Fill = $conv.ConvertFrom($p.fill) }
      if ($p.stroke) { $pa.Stroke = $conv.ConvertFrom($p.stroke); $pa.StrokeThickness = $(if ($p.w) { $p.w } else { 1.6 }); $pa.StrokeLineJoin = 'Round'; $pa.StrokeStartLineCap = 'Round'; $pa.StrokeEndLineCap = 'Round' }
      if ($null -ne $p.op) { $pa.Opacity = $p.op }
      if ($p.clip) { $pa.Clip = $p.clip }
    }
    [void]$cv.Children.Add($pa)
  }
  $vb = New-Object Windows.Controls.Viewbox; $vb.Width = $wd; $vb.Height = $wd * 80 / 120; $vb.Child = $cv; $vb.IsHitTestVisible = $false; $vb
}
# 🎣 도감 낚싯대: each step's picture is a strip of stills (client/assets/rods, scripts/make-rods.js)
# played in turn on every rod out; rods.json says where the hand and tip are in a still, and each
# step's line and float colours and whether a sky glows behind it (step 10 on).
$S.rodArt = $null; $S.rodPics = @{}; $S.rodLive = New-Object Collections.ArrayList; $S.rodTick = 0
function Rod-Art {
  if ($null -eq $S.rodArt) {
    $S.rodArt = $false
    try { $S.rodArt = Get-Content -Raw -Encoding UTF8 (Join-Path (Split-Path $pets) 'rods\rods.json') | ConvertFrom-Json } catch {}
  }
  $S.rodArt
}
function Rod-Pics($file) {
  if (-not $S.rodPics.ContainsKey($file)) {
    $a = Rod-Art; $p = Join-Path (Split-Path $pets) "rods\$file"; $S.rodPics[$file] = $null
    if ($a -and (Test-Path $p)) {
      $bmp = New-Object Windows.Media.Imaging.BitmapImage
      $bmp.BeginInit(); $bmp.UriSource = [Uri]$p; $bmp.CacheOption = 'OnLoad'; $bmp.EndInit()
      $S.rodPics[$file] = @(0..($a.frames - 1) | ForEach-Object { New-Object Windows.Media.Imaging.CroppedBitmap $bmp, (New-Object Windows.Int32Rect ($_ * $a.w), 0, $a.w, $a.h) })
    }
  }
  $S.rodPics[$file]
}
$rodClock = New-Object Windows.Threading.DispatcherTimer; $rodClock.Interval = [TimeSpan]::FromMilliseconds(200)
$rodClock.Add_Tick({
  $S.rodTick++
  foreach ($p in @($S.rodLive)) { $p.img.Source = $p.pics[$S.rodTick % $p.pics.Count] }
  if (-not $S.rodLive.Count) { $rodClock.Stop() }
})
# One strip as an image in $cv, scaled by $k and laid so the still's point ($ax,$ay) is at ($x,$y),
# turned by $turn degrees about it; it plays along with the others.
function Rod-Pic($cv, $pics, $k, $ax, $ay, $x, $y, $turn, $alpha) {
  $a = Rod-Art
  $img = New-Object Windows.Controls.Image; $img.Source = $pics[0]; $img.Width = $a.w * $k; $img.Height = $a.h * $k; $img.Opacity = $alpha; $img.IsHitTestVisible = $false
  [Windows.Media.RenderOptions]::SetBitmapScalingMode($img, 'HighQuality')
  if ($turn) { $img.RenderTransform = New-Object Windows.Media.RotateTransform $turn, ($ax * $k), ($ay * $k) }
  [Windows.Controls.Canvas]::SetLeft($img, $x - $ax * $k); [Windows.Controls.Canvas]::SetTop($img, $y - $ay * $k); [void]$cv.Children.Add($img)
  $p = @{ img = $img; pics = $pics }; [void]$S.rodLive.Add($p); if (-not $rodClock.IsEnabled) { $rodClock.Start() }
  $p
}
# A rod in a pet's hand and a pond at its feet, on its left: everything in one canvas laid
# where the pet is now ($o.at), moved along when the row shifts. $cast: thrown with a swing.
# $step: which 도감 낚싯대 (0 = the first).
function Rod($m, $cast, $step = 0) {
  $at = Fx-At $m; $sz = $at.size
  $el = New-Object Windows.Controls.Canvas; $el.IsHitTestVisible = $false
  $mv = New-Object Windows.Media.TranslateTransform; $el.RenderTransform = $mv
  $hx = $at.x - $sz * 0.2; $hy = $at.y + $sz * 0.62; $len = $sz * 0.95
  # The pond lies right under where the rod's tip rests (turned -35°), so the line hangs straight down into it.
  $ra = -35 * [Math]::PI / 180; $px = $hx - $len * 0.62 * [Math]::Cos($ra) - $len * 0.78 * [Math]::Sin($ra)
  $py = $at.foot - 3; $pw = $sz * 1.0; $ph = [Math]::Max(7, $sz * 0.22)
  $pond = New-Object Windows.Shapes.Ellipse; $pond.Width = $pw; $pond.Height = $ph; $pond.Fill = $conv.ConvertFrom('#CC6FA3DA'); $pond.Stroke = $conv.ConvertFrom('#4F7FB8'); $pond.StrokeThickness = 1
  [Windows.Controls.Canvas]::SetLeft($pond, $px - $pw / 2); [Windows.Controls.Canvas]::SetTop($pond, $py - $ph / 2); [void]$el.Children.Add($pond)
  $glint = New-Object Windows.Shapes.Ellipse; $glint.Width = $pw * 0.35; $glint.Height = 2; $glint.Fill = $conv.ConvertFrom('#AAFFFFFF')
  [Windows.Controls.Canvas]::SetLeft($glint, $px - $pw * 0.3); [Windows.Controls.Canvas]::SetTop($glint, $py - $ph * 0.25); [void]$el.Children.Add($glint)
  # The rod turns about the hand; its tip is where the line hangs from.
  $rod = New-Object Windows.Controls.Canvas; $rot = New-Object Windows.Media.RotateTransform -35, $hx, $hy; $rod.RenderTransform = $rot
  $tx = $hx - $len * 0.62; $ty = $hy - $len * 0.78
  $art = Rod-Art; $kind = $(if ($art) { $art.rods[[Math]::Max(0, [Math]::Min($art.rods.Count - 1, [int]$step))] })
  $n = '{0:D2}' -f ([Math]::Max(0, [Math]::Min(14, [int]$step)) + 1)
  $pics = $(if ($kind) { Rod-Pics "rod-$n.png" })
  $live = @()
  if ($pics) {
    # The still's pole, from its hand to its tip, laid on this one's: same length, turned to match.
    $sx = $art.tip[0] - $art.hand[0]; $sy = $art.tip[1] - $art.hand[1]
    $k = [Math]::Sqrt(($tx - $hx) * ($tx - $hx) + ($ty - $hy) * ($ty - $hy)) / [Math]::Sqrt($sx * $sx + $sy * $sy)
    $turn = ([Math]::Atan2($ty - $hy, $tx - $hx) - [Math]::Atan2($sy, $sx)) * 180 / [Math]::PI
    if ($kind.sky) {
      # From step 10 its sky glows behind the pet and the pond, a little bigger than the still.
      $sk = Rod-Pics "sky-$n.png"
      if ($sk) { $sv = New-Object Windows.Controls.Canvas; $live += Rod-Pic $sv $sk ($k * 1.5) 125 140 ($hx - $len * 0.1) ($at.foot - $sz * 0.1) 0 0.9; $el.Children.Insert(0, $sv) }
    }
    $live += Rod-Pic $rod $pics $k $art.hand[0] $art.hand[1] $hx $hy $turn 1
  } else {
    $pole = New-Object Windows.Shapes.Line; $pole.X1 = $hx; $pole.Y1 = $hy; $pole.X2 = $tx; $pole.Y2 = $ty
    $pole.Stroke = $conv.ConvertFrom('#9C6B3E'); $pole.StrokeThickness = 2.4; $pole.StrokeStartLineCap = 'Round'; $pole.StrokeEndLineCap = 'Round'; [void]$rod.Children.Add($pole)
    $grip = New-Object Windows.Shapes.Line; $grip.X1 = $hx + 2; $grip.Y1 = $hy + 2.5; $grip.X2 = $hx - $len * 0.12; $grip.Y2 = $hy - $len * 0.15
    $grip.Stroke = $conv.ConvertFrom('#4A3424'); $grip.StrokeThickness = 3.4; $grip.StrokeStartLineCap = 'Round'; [void]$rod.Children.Add($grip)
  }
  [void]$el.Children.Add($rod)
  $lc = $(if ($kind) { $kind.line } else { '#DDE6F2' }); $bc = $(if ($kind) { $kind.bob } else { @('#E5484D', '#F2F2F2') })
  $line = New-Object Windows.Shapes.Path; $line.Stroke = $conv.ConvertFrom($lc); $line.StrokeThickness = 0.9; [void]$el.Children.Add($line)
  $bob = New-Object Windows.Controls.Canvas; $bt = New-Object Windows.Media.TranslateTransform; $bob.RenderTransform = $bt
  $b1 = New-Object Windows.Shapes.Ellipse; $b1.Width = 7; $b1.Height = 7; $b1.Fill = $conv.ConvertFrom($bc[1]); $b1.Stroke = $conv.ConvertFrom('#55000000'); $b1.StrokeThickness = 0.6
  $b2 = New-Object Windows.Shapes.Path; $b2.Fill = $conv.ConvertFrom($bc[0]); $b2.Data = [Windows.Media.Geometry]::Parse('M 0,3.5 A 3.5,3.5 0 0 1 7,3.5 Z')
  [Windows.Controls.Canvas]::SetLeft($b1, -3.5); [Windows.Controls.Canvas]::SetTop($b1, -5); [Windows.Controls.Canvas]::SetLeft($b2, -3.5); [Windows.Controls.Canvas]::SetTop($b2, -5)
  [void]$bob.Children.Add($b1); [void]$bob.Children.Add($b2)
  [Windows.Controls.Canvas]::SetLeft($bob, $px); [Windows.Controls.Canvas]::SetTop($bob, $py); [void]$el.Children.Add($bob)
  $o = @{ key = $null; el = $el; mv = $mv; at = $at; rot = $rot; line = $line; bob = $bob; bt = $bt; tip = @($tx, $ty); hand = @($hx, $hy); bx = $px; by = $py; px = $px; py = $py; pw = $pw; m = $m; live = $live }
  Rod-Line $o
  $S.fxc.Children.Insert(0, $el)
  if ($cast) {
    # Swung back over the shoulder and flicked forward; the bobber flies out and plops in.
    Anim $rot ([Windows.Media.RotateTransform]::AngleProperty) 40 -35 380 0 $null
    $bob.Opacity = 0; $line.Opacity = 0
    After 330 { param($o)
      $o.bob.Opacity = 1; $o.line.Opacity = 1
      $e = New-Object Windows.Media.Animation.QuadraticEase; $e.EasingMode = 'EaseIn'
      Anim $o.bt ([Windows.Media.TranslateTransform]::XProperty) ($o.tip[0] - $o.bx) 0 380 0 $null
      Anim $o.bt ([Windows.Media.TranslateTransform]::YProperty) ($o.tip[1] - $o.by) 0 380 0 $e
      After 390 { param($o) Ripple $o; Bob-Float $o } $o
    } $o
    Anim $pond ([Windows.UIElement]::OpacityProperty) 0 1 300 0 $null
  } else { Bob-Float $o }
  $o
}
# The line from the rod's tip to the bobber, sagging a little; drawn again as the bobber moves.
function Rod-Line($o) {
  $a = [Math]::PI * $o.rot.Angle / 180; $dx = $o.tip[0] - $o.hand[0]; $dy = $o.tip[1] - $o.hand[1]
  $tx = $o.hand[0] + $dx * [Math]::Cos($a) - $dy * [Math]::Sin($a); $ty = $o.hand[1] + $dx * [Math]::Sin($a) + $dy * [Math]::Cos($a)
  $bx = $o.bx + $o.bt.X; $by = $o.by - 4 + $o.bt.Y
  $ci = [Globalization.CultureInfo]::InvariantCulture
  $o.line.Data = [Windows.Media.Geometry]::Parse([string]::Format($ci, 'M {0:0.0},{1:0.0} Q {2:0.0},{3:0.0} {4:0.0},{5:0.0}', $tx, $ty, (($tx + $bx) / 2), ([Math]::Max($ty, $by) + 4), $bx, $by))
}
function Bob-Float($o) {
  $y = New-Object Windows.Media.Animation.DoubleAnimation; $y.From = 0; $y.To = 1.6; $y.Duration = New-Object Windows.Duration ([TimeSpan]::FromMilliseconds(700))
  $y.AutoReverse = $true; $y.RepeatBehavior = [Windows.Media.Animation.RepeatBehavior]::Forever
  $o.bt.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, $y)
}
function Ripple($o, $big = $false) {
  for ($i = 0; $i -lt $(if ($big) { 3 } else { 2 }); $i++) {
    $rg = New-Object Windows.Shapes.Ellipse; $rg.Width = 6; $rg.Height = 2.4; $rg.Stroke = $conv.ConvertFrom('#E8F4FF'); $rg.StrokeThickness = 1; $rg.IsHitTestVisible = $false
    $sc = New-Object Windows.Media.ScaleTransform 1, 1, 3, 1.2; $rg.RenderTransform = $sc
    [Windows.Controls.Canvas]::SetLeft($rg, $o.bx + $o.mv.X - 3); [Windows.Controls.Canvas]::SetTop($rg, $o.by + $o.mv.Y - 1.2); [void]$S.fxc.Children.Add($rg)
    $k = $(if ($big) { 6 } else { 4 })
    Anim $sc ([Windows.Media.ScaleTransform]::ScaleXProperty) 1 $k 700 ($i * 220) $null; Anim $sc ([Windows.Media.ScaleTransform]::ScaleYProperty) 1 $k 700 ($i * 220) $null
    Anim $rg ([Windows.UIElement]::OpacityProperty) 1 0 700 ($i * 220) $null; Fx-Drop $rg (760 + $i * 220)
  }
}
function Splash($x, $y, $n = 8) {
  for ($i = 0; $i -lt $n; $i++) {
    $d = New-Object Windows.Shapes.Ellipse; $d.Width = 3; $d.Height = 3; $d.Fill = $conv.ConvertFrom('#CFE6FF')
    $e = New-Object Windows.Media.Animation.QuadraticEase; $e.EasingMode = 'EaseOut'
    Fx-Go $d $x $y ($S.rnd.Next(-16, 17)) (-8 - $S.rnd.Next(14)) 420 0 $e
  }
}
function Rod-Drop($o) {
  if (-not $o) { return }
  foreach ($p in @($o.live)) { $S.rodLive.Remove($p) }
  $o.bt.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, $null)
  Anim $o.el ([Windows.UIElement]::OpacityProperty) 1 0 350 0 $null; Fx-Drop $o.el 400
}

function Fish-Cast {
  if ($S.fish) { Say $S.members[''] '🎣' '벌써 낚싯대를 던졌어요 — 찌가 쑥 들어가면 펫을 클릭!' 3; return }
  $fl = $(if (To) { To } else { $S.floor }); if (-not $fl) { Say $S.members[''] '🎣' '먼저 층에 들어가야 낚시할 수 있어요' 3; return }
  if (-not $S.fxw -or -not $w.IsVisible) { return }
  $r = Ask '/api/fish' @{ floor = $fl; op = 'cast' }
  if ($r.error) { Say $S.members[''] '🎣' $r.error 3; return }
  Place-Fx
  $now = Get-Date
  $rd = Rod $S.members[''] $true $r.rod; $rd.key = ''
  $S.fish = @{ floor = $fl; rod = $rd; bite = $now.AddMilliseconds($r.biteIn); until = $now.AddMilliseconds($r.biteIn + $r.window); state = 'wait'; mark = $null }
  # The drawings come while the line sits in the water, so the catch shows at once.
  After 900 { [void](Fish-Looks) } $null
}
# 🎣 계속 낚시: once started (/낚시, the menu, the book), my pet casts again by itself a moment
# after each bite (Fish-Auto) until I stop it (/낚시 again, the menu, hiding the pets) or two
# bites in a row go by unclicked: nobody at the desk, so no line left out all afternoon.
$S.fishLoop = $false; $S.fishAway = 0
function Fish-Go {
  if ($S.fishLoop) { Fish-Stop; Say $S.members[''] '🎣' '낚시를 그만했어요' 3; return }
  $v = $S.contest
  if ($v -and $v.phase -eq 'on' -and $v.joined) { Fish-Cast; return }
  if (-not $S.fish) { Fish-Cast; if (-not $S.fish) { return } }
  $S.fishLoop = $true; $S.fishAway = 0
  Say $S.members[''] '🎣' '계속 낚시해요 — 그만하려면 /낚시 한 번 더' 3
}
function Fish-Stop {
  $S.fishLoop = $false
  $fs = $S.fish; if (-not $fs) { return }
  $S.fish = $null; if ($fs.mark) { $S.fxc.Children.Remove($fs.mark) }; if ($fs.bar) { $S.fxc.Children.Remove($fs.bar) }; Rod-Drop $fs.rod
  [void](Ask '/api/fish' @{ floor = $fs.floor; op = 'stop' })
}
# Every animation tick while my line is in: a nibble now and then, the bite, and a bite let go.
function Fish-Tick {
  foreach ($o in @($S.rods.Values) + @($(if ($S.fish) { $S.fish.rod }))) {
    if (-not $o) { continue }
    if ($null -ne $o.key -and $S.members.Contains($o.key)) { $o.m = $S.members[$o.key] }
    if (-not $o.m.img.ActualWidth -or -not $o.m.img.IsVisible) { continue }
    $at = Fx-At $o.m; $o.mv.X = $at.x - $o.at.x; $o.mv.Y = $at.foot - $o.at.foot
    $o.el.Visibility = $(if ($o.m.img.Visibility -eq 'Visible') { 'Visible' } else { 'Hidden' })
    Rod-Line $o
  }
  $fs = $S.fish; if (-not $fs) { return }
  $now = Get-Date
  if ($fs.state -eq 'wait') {
    if ($now -ge $fs.bite) {
      # The bite: down goes the bobber, the rod tip shakes, and a ❗ over my head.
      $fs.state = 'bite'; $o = $fs.rod
      $o.bt.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, $null)
      Anim $o.bt ([Windows.Media.TranslateTransform]::YProperty) 0 6 160 0 $null; Anim $o.bob ([Windows.UIElement]::OpacityProperty) 1 0.35 160 0 $null
      $x = New-Object Windows.Media.Animation.DoubleAnimation; $x.From = -35; $x.To = -27; $x.Duration = New-Object Windows.Duration ([TimeSpan]::FromMilliseconds(90))
      $x.AutoReverse = $true; $x.RepeatBehavior = [Windows.Media.Animation.RepeatBehavior]::Forever; $o.rot.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, $x)
      Ripple $o $true; Splash ($o.bx + $o.mv.X) ($o.by + $o.mv.Y - 3) 5
      $at = Fx-At $S.members['']
      $mk = Fx-Text '❗' 26 '#FFD43B'; $mk.RenderTransformOrigin = New-Object Windows.Point 0.5, 1
      $sc = New-Object Windows.Media.ScaleTransform 0.2, 0.2; $mk.RenderTransform = $sc
      Fx-Add $mk ($at.x - 9) ($at.y - 40); $fs.mark = $mk
      $back = New-Object Windows.Media.Animation.BackEase; $back.Amplitude = 1.2
      Anim $sc ([Windows.Media.ScaleTransform]::ScaleXProperty) 0.2 1 260 0 $back; Anim $sc ([Windows.Media.ScaleTransform]::ScaleYProperty) 0.2 1 260 0 $back
    } elseif ($S.rnd.Next(14) -eq 0 -and ($fs.bite - $now).TotalMilliseconds -gt 700) {
      # A nibble: a little dip that is not the bite yet.
      $o = $fs.rod; $o.bt.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, $null)
      Anim $o.bt ([Windows.Media.TranslateTransform]::YProperty) 0 2.6 120 0 $null
      After 260 { param($o) if ($S.fish -and $S.fish.rod -eq $o -and $S.fish.state -eq 'wait') { Bob-Float $o } } $o
      Ripple $o
    }
  } elseif ($fs.state -eq 'bite' -and $now -gt $fs.until.AddMilliseconds(250)) { $fs.unclicked = $true; Fish-Reel }
  # Too long on a go: that go is lost.
  elseif ($fs.state -eq 'fight' -and $now -gt $fs.until) { Fight-Miss }
}
# 🏁 낚시대회 (server/fish.js contest*): opened with /낚시대회 or from the menu, a card for everyone
# on the floor to join for half a minute; then, for those in it, the board (best first, everyone's
# bites, the time left) while my pet casts by itself between bites. The top three end up on the
# podium (Brag with a place).
$S.contest = $null; $S.contestSig = ''; $S.contestHidden = $null; $S.contestAt = $null; $S.fishBusy = [datetime]::MinValue
function Contest-Do($body) {
  $fl = $(if ($S.contest) { $S.contest.floor } elseif (To) { To } else { $S.floor })
  if (-not $fl) { Say $S.members[''] '🏁' '먼저 층에 들어가야 낚시대회를 열 수 있어요' 3; return }
  $b = @{ floor = $fl }; foreach ($k in $body.Keys) { $b[$k] = $body[$k] }
  $r = Ask '/api/fish' $b
  if ($r.error) { Say $S.members[''] '🏁' $r.error 3; return }
  $S.contestHidden = $null; $S.contestAt = Get-Date; Show-Contest $r.contest $true
}
function Contest-Button($text, $body, $hot = $false) {
  $b = New-Object Windows.Controls.Button; $b.Content = $text; $b.Tag = $body
  $b.Margin = New-Object Windows.Thickness 3; $b.Padding = New-Object Windows.Thickness 10, 3, 10, 3; $b.BorderThickness = 0
  $b.FontFamily = New-Object Windows.Media.FontFamily 'Malgun Gothic'; $b.FontSize = 12; $b.Cursor = [Windows.Input.Cursors]::Hand
  $b.Background = $conv.ConvertFrom($(if ($hot) { '#3B9EDB' } else { '#3B355A' })); $b.Foreground = [Windows.Media.Brushes]::White
  $b.Add_Click({ param($src) if ($src.Tag -is [scriptblock]) { & $src.Tag } else { Contest-Do $src.Tag } })
  [void]$ui.ContestButtons.Children.Add($b)
}
function Contest-Text($text, $color, $bold = $false) {
  $tb = New-Object Windows.Controls.TextBlock; $tb.Text = $text; $tb.Foreground = $conv.ConvertFrom($color); $tb.FontSize = 11
  $tb.FontFamily = New-Object Windows.Media.FontFamily 'Segoe UI Symbol, Malgun Gothic'; $tb.TextTrimming = 'CharacterEllipsis'
  if ($bold) { $tb.FontWeight = 'Bold' }; $tb
}
# One line of the board: place, name, best catch (in its rarity's colour), bites used.
function Contest-Row($rank, $name, $fish, $tries, $color, $me) {
  $g = New-Object Windows.Controls.Grid; $g.Margin = New-Object Windows.Thickness 0, 1, 0, 1
  foreach ($wd in 24, 62, 0, 28) {
    $cd = New-Object Windows.Controls.ColumnDefinition
    $cd.Width = $(if ($wd) { New-Object Windows.GridLength $wd } else { New-Object Windows.GridLength 1, 'Star' }); [void]$g.ColumnDefinitions.Add($cd)
  }
  $cells = @((Contest-Text $rank '#FFFFFF'), (Contest-Text $name $(if ($me) { '#FFD27A' } else { '#FFFFFF' }) $me), (Contest-Text $fish $color $me), (Contest-Text $tries '#9A93BD'))
  $cells[3].HorizontalAlignment = 'Right'
  for ($i = 0; $i -lt 4; $i++) { [Windows.Controls.Grid]::SetColumn($cells[$i], $i); [void]$g.Children.Add($cells[$i]) }
  [void]$ui.ContestBoard.Children.Add($g)
}
function Show-Contest($v, $direct = $false) {
  # The poll's view comes through this PC's server a few seconds late: right after my own click
  # it would still say what was before (no contest yet, or the one I just left).
  if (-not $direct -and $S.contestAt -and ((Get-Date) - $S.contestAt).TotalMilliseconds -lt 3500) { return }
  # Not mine to watch: one I am not in, once it is past taking joiners, or one I put away.
  if (-not $v -or $v.id -eq $S.contestHidden -or (-not $v.joined -and $v.phase -ne 'open')) {
    if ($ui.Contest.Visibility -eq 'Visible') { $ui.Contest.Visibility = 'Collapsed' }; $S.contest = $null; $S.contestSig = ''; return
  }
  $S.contest = $v
  $sec = [int][Math]::Ceiling($v.left / 1000)
  $ui.ContestClock.Text = $(if ($v.phase -eq 'done') { '끝' } else { '⏱ {0}:{1:00}' -f [Math]::Floor($sec / 60), ($sec % 60) })
  $board = @($v.board)
  $sig = "$($v.id)|$($v.phase)|$($v.joined)|$($v.tries)|" + (@($board | ForEach-Object { "$($_.name):$($_.tries):$($_.fish.name):$($_.fish.size)" }) -join ',')
  if ($sig -eq $S.contestSig) { return }; $S.contestSig = $sig
  if ($ui.Contest.Visibility -ne 'Visible') { $ui.Contest.Visibility = 'Visible'; Pop $ui.Contest 0 10 }
  $ui.ContestBoard.Children.Clear(); $ui.ContestButtons.Children.Clear()
  if ($v.phase -eq 'open') {
    $ui.ContestTitle.Text = "🏁 낚시대회 참가 · $($board.Count)명"
    $who = Contest-Text ('참가: ' + (@($board | ForEach-Object { $_.name }) -join ', ')) '#FFFFFF'; $who.TextWrapping = 'Wrap'; $who.FontSize = 12
    [void]$ui.ContestBoard.Children.Add($who)
    $ui.ContestText.Text = "$($v.by) 님이 열었어요. 2분 동안 5번씩, 가장 귀한 물고기(같은 등급이면 더 큰 것)가 1등! 대회에선 귀한 물고기가 더 잘 물지만 도감에는 안 들어가요."
    if (-not $v.joined) { Contest-Button '참가' @{ op = 'contest-join' } $true; Contest-Button '안 할래요' { $S.contestHidden = $S.contest.id; $ui.Contest.Visibility = 'Collapsed' } }
    elseif ($v.host) { Contest-Button '지금 시작' @{ op = 'contest-start' } $true; Contest-Button '취소' @{ op = 'contest-leave' } }
    else { Contest-Button '나가기' @{ op = 'contest-leave' } }
    return
  }
  $ui.ContestTitle.Text = $(if ($v.phase -eq 'done') { '🏁 낚시대회 결과' } else { "🏁 낚시대회 · 내 낚시 $($v.tries)/$($v.of)" })
  $medal = @('🥇', '🥈', '🥉')
  for ($i = 0; $i -lt $board.Count; $i++) {
    $p = $board[$i]
    $fish = $(if ($p.fish) { "$(if ($p.fish.mark) { "$($p.fish.mark) " })$($p.fish.name) $($p.fish.size)" } else { '—' })
    Contest-Row $(if ($p.fish -and $i -lt 3) { $medal[$i] } else { "$($i + 1)." }) $p.name $fish "$($p.tries)/$($v.of)" $(if ($p.fish) { $p.fish.color } else { '#7D769E' }) ([bool]$p.me)
  }
  $ui.ContestText.Text = $(if ($v.phase -eq 'done') { '대회 물고기는 도감에 들어가지 않아요' } elseif ($v.tries -ge $v.of) { '5번 다 했어요 — 끝나길 기다려요' } else { '펫이 알아서 던져요. 찌가 쑥 들어가면 펫 클릭!' })
}
# My pet casts again by itself a moment after each bite is over (the hub lets a line go back in
# 3 s after the last one): in a contest that is on, until my five are used or time is nearly up;
# otherwise while 계속 낚시 is on (Fish-Go).
function Contest-Auto {
  if ($S.fish) { $S.fishBusy = Get-Date; return }
  $v = $S.contest
  if ($v -and $v.phase -eq 'on' -and $v.joined) { if ($v.tries -ge $v.of -or $v.left -lt 4000) { return } }
  elseif (-not $S.fishLoop) { return }
  if (((Get-Date) - $S.fishBusy).TotalMilliseconds -lt 2600) { return }
  $S.fishBusy = Get-Date; Fish-Cast
}
function Fish-Reel {
  $fs = $S.fish; if (-not $fs -or $fs.state -notin 'wait', 'bite') { return }
  $fs.state = 'hooking'
  if ($fs.mark) { $S.fxc.Children.Remove($fs.mark); $fs.mark = $null }
  # The hub decides first (a moment on this PC): too soon, too late, or on the hook.
  # A bite let go unclicked is a miss, never a fight (the hub would hook it within its slack).
  $ms = [int]((Get-Date) - $fs.bite).TotalMilliseconds
  $r = Ask '/api/fish' @{ floor = $fs.floor; op = 'hook'; late = [bool]$fs.unclicked; ms = $ms; presses = [int]$fs.presses }
  $o = $fs.rod
  Rod-Tug $o
  # A bite nobody clicked (let go when its time was up): two in a row and 계속 낚시 stops.
  if ($fs.unclicked -and $S.fishLoop) {
    $S.fishAway++
    if ($S.fishAway -ge 2) { $S.fishLoop = $false; After 1500 { Say $S.members[''] '🎣' '자리에 없는 것 같아 낚시를 멈췄어요 — /낚시 로 다시' 5 } $null }
  } elseif (-not $fs.unclicked) { $S.fishAway = 0 }
  if ($r.contest) {
    $ca = Fx-At $S.members['']; $ct = Fx-Text "🏁 $($r.contest.n)/$($r.contest.of)" 12 '#9FD8FF'
    Fx-Go $ct ($ca.x + 14) ($ca.y - 60) 0 -16 1400 0
  }
  if (-not $r.hooked) {
    $S.shakeUntil = (Get-Date).AddMilliseconds(380)
    After 380 { param($a) Fish-Lost $a[0] $(if ($a[1].error) { $a[1].error } else { $a[1].text }) } @($o, $r)
    return
  }
  $at = Fx-At $S.members['']
  $S.shakeUntil = (Get-Date).AddMilliseconds(600)
  $say = $(if ($r.rarity -eq 'legend') { '🌟 전설이 걸렸다!!' } elseif ($r.heavy) { '걸렸다! 엄청 무거워!' } else { '걸렸다!' })
  if ($r.rarity -eq 'legend') { Legend-Flash $at }
  $hey = Fx-Text $say 13 '#FFFFFF'; $hey.Effect = New-Object Windows.Media.Effects.DropShadowEffect -Property @{ BlurRadius = 3; ShadowDepth = 1; Opacity = 0.8 }
  Fx-Add $hey ([Math]::Max(2, [Math]::Min($S.fxw.Width - $say.Length * 12 - 4, $at.x - 10 - $say.Length * 5))) ($at.y - 100 * [Math]::Max(0.7, [Math]::Min(1.3, $S.k))); Pop $hey 0 8; Fx-Drop $hey 900
  $fs.state = 'fight'; $fs.zones = @($r.zones); $fs.hit = 0; $fs.until = (Get-Date).AddMilliseconds($r.ms); $fs.rarity = $r.rarity
  Fight-Bar
}
# The rod bends and shakes, the bobber is dragged about under water.
function Rod-Tug($o) {
  $o.rot.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, $null)
  $x = New-Object Windows.Media.Animation.DoubleAnimation; $x.From = -24; $x.To = -8; $x.Duration = New-Object Windows.Duration ([TimeSpan]::FromMilliseconds(70))
  $x.AutoReverse = $true; $x.RepeatBehavior = [Windows.Media.Animation.RepeatBehavior]::Forever; $o.rot.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, $x)
  $y = New-Object Windows.Media.Animation.DoubleAnimation; $y.From = -6; $y.To = 6; $y.Duration = New-Object Windows.Duration ([TimeSpan]::FromMilliseconds(90))
  $y.AutoReverse = $true; $y.RepeatBehavior = [Windows.Media.Animation.RepeatBehavior]::Forever; $o.bt.BeginAnimation([Windows.Media.TranslateTransform]::XProperty, $y)
}
function Rod-Still($o) {
  $o.rot.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, $null); $o.bt.BeginAnimation([Windows.Media.TranslateTransform]::XProperty, $null)
}
# The fight's bar over my head: a marker sweeping from end to end and the part to click it in
# (green; gold for a legend). A miss is not the end: the same fish stays on for another go, up to
# three (the hearts over it), the part somewhere else each time.
function Fight-Bar {
  $fs = $S.fish; $zn = $fs.zones[$fs.hit]
  if ($fs.bar) { $S.fxc.Children.Remove($fs.bar) }
  $at = Fx-At $S.members['']; $k = [Math]::Max(0.7, [Math]::Min(1.3, $S.k))
  $bw = [Math]::Round(128 * $k); $bh = [Math]::Round(14 * $k)
  $el = New-Object Windows.Controls.Canvas; $el.Width = $bw; $el.Height = $bh + 16; $el.IsHitTestVisible = $false
  $bg = New-Object Windows.Controls.Border; $bg.Width = $bw; $bg.Height = $bh; $bg.CornerRadius = 3; $bg.Background = $conv.ConvertFrom('#E61E1B2E'); $bg.BorderBrush = $conv.ConvertFrom('#5E5486'); $bg.BorderThickness = 1
  [void]$el.Children.Add($bg)
  $zc = $(if ($fs.rarity -eq 'legend') { '#F2C14E' } elseif ($fs.rarity -eq 'epic') { '#B98AF0' } else { '#3DBE7A' })
  $zone = New-Object Windows.Controls.Border; $zone.Width = [Math]::Max(6, ($zn.to - $zn.from) * $bw); $zone.Height = $bh - 2; $zone.Background = $conv.ConvertFrom($zc)
  $zone.BorderBrush = [Windows.Media.Brushes]::White; $zone.BorderThickness = New-Object Windows.Thickness 1.5, 0, 1.5, 0
  [Windows.Controls.Canvas]::SetLeft($zone, $zn.from * $bw); [Windows.Controls.Canvas]::SetTop($zone, 1); [void]$el.Children.Add($zone)
  # A legend's last stage: the part itself swings back and forth along the bar.
  if ($zn.drift) {
    $dz = New-Object Windows.Media.Animation.DoubleAnimation; $dz.From = ($zn.from - $zn.drift.amp) * $bw; $dz.To = ($zn.from + $zn.drift.amp) * $bw
    $dz.Duration = New-Object Windows.Duration ([TimeSpan]::FromMilliseconds($zn.drift.ms / 2)); $de = New-Object Windows.Media.Animation.SineEase; $de.EasingMode = 'EaseInOut'; $dz.EasingFunction = $de
    $dz.AutoReverse = $true; $dz.RepeatBehavior = [Windows.Media.Animation.RepeatBehavior]::Forever; $zone.BeginAnimation([Windows.Controls.Canvas]::LeftProperty, $dz)
  }
  $mk = New-Object Windows.Shapes.Rectangle; $mk.Width = 3; $mk.Height = $bh + 8; $mk.RadiusX = 1; $mk.RadiusY = 1; $mk.Fill = [Windows.Media.Brushes]::White
  $mk.Stroke = $conv.ConvertFrom('#88000000'); $mk.StrokeThickness = 0.6
  $mt = New-Object Windows.Media.TranslateTransform; $mk.RenderTransform = $mt; [Windows.Controls.Canvas]::SetTop($mk, -4); [void]$el.Children.Add($mk)
  $sw = New-Object Windows.Media.Animation.DoubleAnimation; $sw.From = 0; $sw.To = $bw - 3; $sw.Duration = New-Object Windows.Duration ([TimeSpan]::FromMilliseconds($zn.sweep))
  if ($zn.ease) { $se = New-Object Windows.Media.Animation.SineEase; $se.EasingMode = 'EaseInOut'; $sw.EasingFunction = $se }
  $sw.AutoReverse = $true; $sw.RepeatBehavior = [Windows.Media.Animation.RepeatBehavior]::Forever; $mt.BeginAnimation([Windows.Media.TranslateTransform]::XProperty, $sw)
  $n = $fs.zones.Count
  $tip = $(if ($n -gt 1) { (@(0..($n - 1) | ForEach-Object { if ($_ -lt $fs.hit) { '♡' } else { '♥' } }) -join '') + '  색칸에 오면 내 펫 클릭!' } else { '색칸에 오면 내 펫 클릭!' })
  $tt = Fx-Text $tip 10 '#FFFFFF'; $tt.FontWeight = 'Bold'; $tt.Effect = New-Object Windows.Media.Effects.DropShadowEffect -Property @{ BlurRadius = 3; ShadowDepth = 1; Opacity = 0.8 }
  # Over the bar, not under it: under it sits on my pet's head.
  [Windows.Controls.Canvas]::SetTop($tt, -16); [void]$el.Children.Add($tt)
  $x0 = [Math]::Max(4, [Math]::Min($S.fxw.Width - $bw - 4, $at.x - $bw / 2))
  Fx-Add $el $x0 ($at.y - 40 - $bh)
  $fs.bar = $el; $fs.mt = $mt; $fs.bw = $bw; $fs.zone = $zone
  # 🌟 A legend's bar: a gold rim glowing in and out, and gold sparkles popping round it.
  if ($fs.rarity -eq 'legend') {
    $bg.BorderBrush = $conv.ConvertFrom('#FFD666'); $bg.BorderThickness = 1.8
    $gl = New-Object Windows.Media.Effects.DropShadowEffect -Property @{ Color = [Windows.Media.Colors]::Gold; BlurRadius = 14; ShadowDepth = 0; Opacity = 0.9 }; $bg.Effect = $gl
    $pu = New-Object Windows.Media.Animation.DoubleAnimation; $pu.From = 0.35; $pu.To = 1; $pu.Duration = New-Object Windows.Duration ([TimeSpan]::FromMilliseconds(380))
    $pu.AutoReverse = $true; $pu.RepeatBehavior = [Windows.Media.Animation.RepeatBehavior]::Forever; $gl.BeginAnimation([Windows.Media.Effects.DropShadowEffect]::OpacityProperty, $pu)
    $tt.Text = "🌟 전설!  $($tt.Text)"; $tt.Foreground = $conv.ConvertFrom('#FFD666')
    for ($i = 0; $i -lt 16; $i++) {
      $sx = $x0 + $S.rnd.Next(0, [int]$bw); $sy = $at.y - 40 - $bh + $(if ($i % 2) { -6 } else { $bh + 2 })
      Fx-Go (Fx-Text '✦' (8 + $S.rnd.Next(6)) '#FFE38A') $sx $sy ($S.rnd.Next(-6, 7)) $(if ($i % 2) { -12 } else { 12 }) 600 ($i * 280)
    }
  }
}
# 🌟 A legend on the hook: a gold ring flashes out from my pet, gold sparkles burst, the row shakes.
function Legend-Flash($at) {
  $cx = $at.x; $cy = $at.y + $at.size * 0.4
  for ($i = 0; $i -lt 2; $i++) {
    $rg = New-Object Windows.Shapes.Ellipse; $rg.Width = 20; $rg.Height = 20; $rg.Stroke = $conv.ConvertFrom('#FFD666'); $rg.StrokeThickness = 3; $rg.IsHitTestVisible = $false
    $rg.Effect = New-Object Windows.Media.Effects.DropShadowEffect -Property @{ Color = [Windows.Media.Colors]::Gold; BlurRadius = 12; ShadowDepth = 0; Opacity = 1 }
    $sc = New-Object Windows.Media.ScaleTransform 1, 1, 10, 10; $rg.RenderTransform = $sc
    Fx-Add $rg ($cx - 10) ($cy - 10)
    $out = New-Object Windows.Media.Animation.QuadraticEase; $out.EasingMode = 'EaseOut'
    Anim $sc ([Windows.Media.ScaleTransform]::ScaleXProperty) 0.5 7 650 ($i * 220) $out; Anim $sc ([Windows.Media.ScaleTransform]::ScaleYProperty) 0.5 7 650 ($i * 220) $out
    Anim $rg ([Windows.UIElement]::OpacityProperty) 1 0 650 ($i * 220) $null; Fx-Drop $rg (700 + $i * 220)
  }
  for ($i = 0; $i -lt 14; $i++) {
    $a = $i * [Math]::PI * 2 / 14; $d = 40 + $S.rnd.Next(30)
    $e = New-Object Windows.Media.Animation.QuadraticEase; $e.EasingMode = 'EaseOut'
    Fx-Go (Fx-Text '✦' (10 + $S.rnd.Next(8)) $(if ($i % 3) { '#FFD666' } else { '#FFFFFF' })) ($cx - 5) ($cy - 8) ([Math]::Cos($a) * $d) ([Math]::Sin($a) * $d * 0.7) 700 ($i * 15) $e
  }
  Shake-Row
}
# A click in the fight: where the marker is now decides it.
function Fight-Click {
  $fs = $S.fish; if (-not $fs -or $fs.state -ne 'fight') { return }
  $zn = $fs.zones[$fs.hit]; $pos = ($fs.mt.X + 1.5) / $fs.bw
  $fs.mt.BeginAnimation([Windows.Media.TranslateTransform]::XProperty, $null); $fs.mt.X = $pos * $fs.bw - 1.5
  # Where the part is now (a drifting one stops where it was).
  $from = [Windows.Controls.Canvas]::GetLeft($fs.zone) / $fs.bw; $to = $from + ($zn.to - $zn.from)
  if ($zn.drift) { $fs.zone.BeginAnimation([Windows.Controls.Canvas]::LeftProperty, $null); [Windows.Controls.Canvas]::SetLeft($fs.zone, $from * $fs.bw) }
  $sl = $(if ($null -ne $zn.slack) { $zn.slack } else { 0.015 })
  if ($pos -ge $from - $sl -and $pos -le $to + $sl) {
    $fs.zone.Background = [Windows.Media.Brushes]::White
    $S.shakeUntil = (Get-Date).AddMilliseconds(300)
    Fight-End $true
  } else {
    $fs.zone.Background = $conv.ConvertFrom('#E5484D')
    Fight-Miss
  }
}
# A go missed (or let run out): another go at the same fish while there are any left.
function Fight-Miss {
  $fs = $S.fish; if (-not $fs -or $fs.state -ne 'fight') { return }
  $fs.hit++
  if ($fs.hit -ge $fs.zones.Count) { Fight-End $false; return }
  $left = $fs.zones.Count - $fs.hit
  $at = Fx-At $S.members['']
  Fx-Go (Fx-Text "한 번 더! ($($left)번 남음)" 12 '#FFD27A') ([Math]::Min($S.fxw.Width - 110, $at.x - 40)) ($at.y - 96) 0 -14 700 0
  $fs.state = 'next'; $fs.until = (Get-Date).AddMilliseconds(6000)
  After 500 { if ($S.fish -and $S.fish.state -eq 'next') { $S.fish.state = 'fight'; $S.fish.until = (Get-Date).AddMilliseconds(5000); Fight-Bar } } $null
}
function Fight-End($won) {
  $fs = $S.fish; if (-not $fs) { return }
  $fs.state = 'landing'
  if ($fs.bar) { Anim $fs.bar ([Windows.UIElement]::OpacityProperty) 1 0 200 250 $null; Fx-Drop $fs.bar 480; $fs.bar = $null }
  $r = Ask '/api/fish' @{ floor = $fs.floor; op = 'land'; hit = [bool]$won }
  $o = $fs.rod
  if ($r.fish) { After 200 { param($a) Rod-Still $a[0]; Fish-Catch $a[1] $a[0] } @($o, $r); return }
  After 200 { param($a) Fish-Lost $a[0] $(if ($a[1].error) { $a[1].error } else { $a[1].text }) $true } @($o, $r)
}
# Nothing landed: the line goes slack (or snaps with a "툭!") and the bobber comes up empty.
function Fish-Lost($o, $text, $snap = $false) {
  Rod-Still $o
  Anim $o.rot ([Windows.Media.RotateTransform]::AngleProperty) -16 -40 200 0 $null
  if ($snap) {
    $o.line.Visibility = 'Collapsed'; $o.bob.Opacity = 0
    Fx-Go (Fx-Text '툭!' 13 '#FFB3AD') ($o.bx + $o.mv.X - 8) ($o.by + $o.mv.Y - 30) 0 -12 700 0
    Ripple $o $true
  } else {
    Anim $o.bob ([Windows.UIElement]::OpacityProperty) 0.35 1 150 0 $null
    Anim $o.bt ([Windows.Media.TranslateTransform]::YProperty) 6 -14 300 0 $null
  }
  Say $S.members[''] '🎣' $text 4
  After 650 { param($o) Rod-Drop $o; $S.fish = $null } $o
}
# A big splash out of the pond: drops thrown high and a "철퍽!".
function Big-Splash($x, $y, $n) {
  for ($i = 0; $i -lt $n; $i++) {
    $sz = 2 + $S.rnd.Next(3); $d = New-Object Windows.Shapes.Ellipse; $d.Width = $sz; $d.Height = $sz; $d.Fill = $conv.ConvertFrom($(if ($i % 3) { '#CFE6FF' } else { '#FFFFFF' }))
    $up = New-Object Windows.Media.Animation.QuadraticEase; $up.EasingMode = 'EaseOut'
    Fx-Go $d ($x + $S.rnd.Next(-6, 7)) $y ($S.rnd.Next(-26, 27)) (-18 - $S.rnd.Next(34)) (480 + $S.rnd.Next(200)) 0 $up
  }
  $t = Fx-Text '철퍽!' 13 '#E8F4FF'; $t.Effect = New-Object Windows.Media.Effects.DropShadowEffect -Property @{ BlurRadius = 3; ShadowDepth = 1; Opacity = 0.8 }
  Fx-Go $t ([Math]::Max(2, $x - 34)) ($y - 26) -6 -14 800 0
}
# My pet hops for joy (twice for a big one).
function Joy-Hop($big) {
  $t = New-Object Windows.Media.TranslateTransform; $S.members[''].g.RenderTransform = $t; $h = $(if ($big) { -24 } else { -14 })
  Anim $t ([Windows.Media.TranslateTransform]::YProperty) 0 $h 170 0 $null
  After 190 { param($a) Anim $a[0] ([Windows.Media.TranslateTransform]::YProperty) $a[1] 0 260 0 $null } @($t, $h)
  if ($big) { After 520 { param($t) Anim $t ([Windows.Media.TranslateTransform]::YProperty) 0 -12 150 0 $null; After 160 { param($t) Anim $t ([Windows.Media.TranslateTransform]::YProperty) -12 0 220 0 $null } $t } $t }
}
# How wide a catch is drawn: by its size, a 3 cm one small and a whale big (on a log scale, so a
# 30 cm one is still a good handful); junk at a middling size.
function Fish-Width($f) {
  $cm = $f.cm; if (-not $cm) { return 58 }
  [Math]::Max(38, [Math]::Min(124, 30 + 24 * [Math]::Log10([double]$cm)))
}
# The catch: the rod heaves up and the fish comes out of the pond on the end of the line, hangs
# there flapping and dripping, then my pet takes it and holds it up over its head with its name,
# size and news. As big as it really is (Fish-Width); the rarer, the more sparkle.
function Fish-Catch($r, $o) {
  $f = $r.fish; $at = Fx-At $S.members['']
  $wd = Fish-Width $f
  $hold = switch ($f.rarity) { 'legend' { 5200 } 'epic' { 4200 } 'rare' { 3600 } default { 3000 } }
  $big = $f.rarity -in 'epic', 'legend'
  # Heave: the rod bends down hard, then swings up; a splash where the float was.
  $o.rot.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, $null)
  Anim $o.rot ([Windows.Media.RotateTransform]::AngleProperty) -10 -2 140 0 $null
  $sw = New-Object Windows.Media.Animation.BackEase; $sw.Amplitude = 0.5; $sw.EasingMode = 'EaseOut'
  Anim $o.rot ([Windows.Media.RotateTransform]::AngleProperty) -2 -48 420 140 $sw
  Big-Splash ($o.bx + $o.mv.X) ($o.by + $o.mv.Y - 3) $(if ($big) { 26 } else { 16 }); Ripple $o $true
  # The fish on the end of the line, head up: its mouth where the float was. The float was dimmed
  # under water at the bite; the fish comes out in full.
  $o.bob.Children.Clear(); $o.bob.BeginAnimation([Windows.UIElement]::OpacityProperty, $null); $o.bob.Opacity = 1
  $k = [Math]::Max(0.55, [Math]::Min(1.3, $S.k)); $hw = $wd * $k
  $vb = Fish-Visual $f.id $hw
  if ($vb) {
    $nx = $hw * 14 / 120; $ny = $hw / 3
    $swing = New-Object Windows.Media.RotateTransform 90, $nx, $ny
    $vb.RenderTransform = $swing
    [Windows.Controls.Canvas]::SetLeft($vb, -$nx); [Windows.Controls.Canvas]::SetTop($vb, -$ny); [void]$o.bob.Children.Add($vb)
    # Flapping on the line.
    $fl = New-Object Windows.Media.Animation.DoubleAnimation; $fl.From = 64; $fl.To = 116; $fl.Duration = New-Object Windows.Duration ([TimeSpan]::FromMilliseconds(120))
    $fl.AutoReverse = $true; $fl.RepeatBehavior = New-Object Windows.Media.Animation.RepeatBehavior 6; $fl.BeginTime = [TimeSpan]::FromMilliseconds(500)
    $swing.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, $fl)
  }
  # Up it comes, to hang a little under where the rod's tip ends up (the line follows: Fish-Tick).
  $lift = -[Math]::Max(30, $o.by - $at.y + 6 + $hw * 0.2); $over = ($o.hand[0] - $o.bx) * 0.25
  $o.bt.BeginAnimation([Windows.Media.TranslateTransform]::YProperty, $null)
  $ue = New-Object Windows.Media.Animation.QuadraticEase; $ue.EasingMode = 'EaseOut'
  Anim $o.bt ([Windows.Media.TranslateTransform]::YProperty) 4 $lift 520 120 $ue
  Anim $o.bt ([Windows.Media.TranslateTransform]::XProperty) 0 $over 520 120 $ue
  # Drips off it while it hangs.
  for ($i = 0; $i -lt 6; $i++) {
    After (650 + $i * 140) { param($o)
      $d = New-Object Windows.Shapes.Ellipse; $d.Width = 2.5; $d.Height = 3.5; $d.Fill = $conv.ConvertFrom('#CFE6FF')
      $e = New-Object Windows.Media.Animation.QuadraticEase; $e.EasingMode = 'EaseIn'
      Fx-Go $d ($o.bx + $o.mv.X + $o.bt.X + $S.rnd.Next(-5, 6)) ($o.by + $o.mv.Y + $o.bt.Y + 6) 0 (24 + $S.rnd.Next(10)) 420 0 $e
    } $o
  }
  $lines = @("$(if ($f.mark) { "$($f.mark) " })$($f.name)$(if ($f.size) { " · $($f.size)" })")
  $news = @()
  if ($f.rarity -eq 'junk') { $news += ,@('꽝!', '#8A7560', '#FFFFFF') }
  if ($r.isNew) { $news += ,@("NEW $($r.count)/$($r.of)", '#3DBE7A', '#FFFFFF') }
  if ($r.luck) { $news += ,@('🍀 다음 한 번 행운', '#2E8B57', '#FFFFFF') }
  if ($r.points) { $news += ,@("⚒️ +$($r.points)", '#8C5A2E', '#FFE8B0') }
  if ($r.charm) { $news += ,@('🛡 부적 +1', '#3B7DD8', '#FFFFFF') }
  if ($r.record) { $news += ,@('층 최대어', '#F2C14E', '#2A2000') } elseif ($r.best -and -not $r.isNew) { $news += ,@('내 최고', '#5DADEC', '#FFFFFF') }
  # Then into my pet's paws: off the line and up over its head, with a hop (two for a big one).
  After 1500 { param($a)
    $f, $o, $wd, $lines, $news, $hold = $a
    $at = Fx-At $S.members['']
    $x0 = $o.bx + $o.mv.X + $o.bt.X; $y0 = $o.by + $o.mv.Y + $o.bt.Y
    Rod-Drop $o
    Joy-Hop ($f.rarity -in 'rare', 'epic', 'legend')
    $card = Fish-Card $f $wd $lines $news
    $top = [Math]::Max(4, $at.y - $wd * [Math]::Max(0.55, [Math]::Min(1.3, $S.k)) * 0.66 - 46)
    Fish-Hold $card $x0 $y0 $at.x $top $wd $hold
    $cx = [Math]::Max($wd / 2 + 4, [Math]::Min($S.fxw.Width - $wd / 2 - 4, $at.x))
    if ($f.rarity -in 'rare', 'epic', 'legend') { for ($i = 0; $i -lt 8; $i++) { Fx-Go (Fx-Text '✦' (9 + $S.rnd.Next(6)) $f.color) ($cx - 4 + $S.rnd.Next(-$wd / 2, $wd / 2)) ($top + $S.rnd.Next(10, 40)) ($S.rnd.Next(-14, 15)) (-30 - $S.rnd.Next(20)) 1300 (300 + $i * 120) } }
    if ($f.rarity -eq 'legend') { Burst ($cx - 40) ($top + 30) 70 400; Burst ($cx + 36) ($top + 30) 90 800; Shake-Row }
  } @($f, $o, $wd, $lines, $news, $hold)
  After ($hold + 2400) { $S.fish = $null } $null
}
# Off the line at ($x0, $y0) up to over my head ($cx, $top): a short toss with a flip, held
# there with a wriggle, then gone. The card is placed by its middle.
function Fish-Hold($card, $x0, $y0, $cx, $top, $wd, $hold) {
  $card.Measure((New-Object Windows.Size 400, 400)); $cw = [Math]::Max($wd, $card.DesiredSize.Width)
  $cx = [Math]::Max($cw / 2 + 12, [Math]::Min($S.fxw.Width - $cw / 2 - 12, $cx))
  $mv = New-Object Windows.Media.TranslateTransform; $rt = New-Object Windows.Media.RotateTransform 0, ($cw / 2), ($wd * 0.33)
  $tg = New-Object Windows.Media.TransformGroup; foreach ($t in $rt, $mv) { $tg.Children.Add($t) }; $card.RenderTransform = $tg
  Fx-Add $card ($cx - $cw / 2) $top
  $up = New-Object Windows.Media.Animation.BackEase; $up.Amplitude = 0.5; $up.EasingMode = 'EaseOut'
  Anim $mv ([Windows.Media.TranslateTransform]::XProperty) ($x0 - $cx) 0 380 0 $null
  Anim $mv ([Windows.Media.TranslateTransform]::YProperty) ($y0 - $top - $wd * 0.33) 0 380 0 $up
  Anim $rt ([Windows.Media.RotateTransform]::AngleProperty) 90 0 380 0 $null
  After 420 { param($a)
    $rt, $mv = $a
    $x = New-Object Windows.Media.Animation.DoubleAnimation; $x.From = -7; $x.To = 7; $x.Duration = New-Object Windows.Duration ([TimeSpan]::FromMilliseconds(110))
    $x.AutoReverse = $true; $x.RepeatBehavior = New-Object Windows.Media.Animation.RepeatBehavior 3; $rt.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, $x)
  } @($rt, $mv)
  $fade = New-Object Windows.Media.Animation.QuadraticEase; $fade.EasingMode = 'EaseIn'
  Anim $card ([Windows.UIElement]::OpacityProperty) 1 0 450 $hold $fade
  Fx-Drop $card ($hold + 500)
}
# A legend shakes the row of pets for a moment.
function Shake-Row {
  $t = New-Object Windows.Media.TranslateTransform; $ui.Row.RenderTransform = $t
  $x = New-Object Windows.Media.Animation.DoubleAnimation; $x.From = -4; $x.To = 4; $x.Duration = New-Object Windows.Duration ([TimeSpan]::FromMilliseconds(50))
  $x.AutoReverse = $true; $x.RepeatBehavior = New-Object Windows.Media.Animation.RepeatBehavior 5; $t.BeginAnimation([Windows.Media.TranslateTransform]::XProperty, $x)
}
# The fish with its name under it (and what it means for me), as one piece that leaps.
function Fish-Card($f, $wd, $lines, $news) {
  $sp = New-Object Windows.Controls.StackPanel; $sp.IsHitTestVisible = $false
  # As big as the pets are drawn (the pets' size from the grip or Ctrl+wheel).
  $k = [Math]::Max(0.55, [Math]::Min(1.3, $S.k)); $sp.LayoutTransform = New-Object Windows.Media.ScaleTransform $k, $k
  $vb = Fish-Visual $f.id $wd; if ($vb) { $vb.HorizontalAlignment = 'Center'; [void]$sp.Children.Add($vb) }
  $tag = New-Object Windows.Controls.Border; $tag.Background = $conv.ConvertFrom('#F01E1B2E'); $tag.CornerRadius = 10; $tag.Padding = New-Object Windows.Thickness 8, 2, 8, 3
  $tag.HorizontalAlignment = 'Center'; $tag.Margin = New-Object Windows.Thickness 0, 1, 0, 0
  $tb = New-Object Windows.Controls.TextBlock; $tb.FontFamily = New-Object Windows.Media.FontFamily 'Malgun Gothic'; $tb.FontSize = 12; $tb.FontWeight = 'Bold'; $tb.Foreground = [Windows.Media.Brushes]::White
  $tb.Text = $lines -join ' '; $tag.Child = $tb
  # A thin stripe in the rarity's colour under the name.
  $bar = New-Object Windows.Controls.Border; $bar.Height = 2; $bar.CornerRadius = 1; $bar.Margin = New-Object Windows.Thickness 10, 0, 10, 0; $bar.Background = $conv.ConvertFrom($f.color)
  [void]$sp.Children.Add($tag); [void]$sp.Children.Add($bar)
  if ($news.Count) {
    $row = New-Object Windows.Controls.WrapPanel; $row.HorizontalAlignment = 'Center'; $row.Margin = New-Object Windows.Thickness 0, 3, 0, 0
    foreach ($n in $news) {
      $pill = New-Object Windows.Controls.Border; $pill.CornerRadius = 7; $pill.Padding = New-Object Windows.Thickness 6, 0, 6, 1; $pill.Margin = New-Object Windows.Thickness 1.5, 0, 1.5, 0
      $pill.Background = $conv.ConvertFrom($n[1])
      $pt = New-Object Windows.Controls.TextBlock; $pt.Text = $n[0]; $pt.FontFamily = New-Object Windows.Media.FontFamily 'Malgun Gothic'; $pt.FontSize = 10; $pt.FontWeight = 'Bold'; $pt.Foreground = $conv.ConvertFrom($n[2])
      $pill.Child = $pt; [void]$row.Children.Add($pill)
    }
    [void]$sp.Children.Add($row)
  }
  $sp
}
# Out of the water at ($x0, $y0), up in an arc to ($cx, $top) with a flip and a wriggle; held,
# then gone. The card is placed by its middle.
function Fish-Leap($card, $x0, $y0, $cx, $top, $wd, $hold) {
  $card.Measure((New-Object Windows.Size 400, 400)); $cw = [Math]::Max($wd, $card.DesiredSize.Width)
  # No Width set: it would be taken before the pets-size scale and cut the name short.
  # Kept inside the window: the name under it is often wider than the fish.
  $cx = [Math]::Max($cw / 2 + 12, [Math]::Min($S.fxw.Width - $cw / 2 - 12, $cx))
  $mv = New-Object Windows.Media.TranslateTransform; $rt = New-Object Windows.Media.RotateTransform 0, ($cw / 2), ($wd * 0.33); $sc = New-Object Windows.Media.ScaleTransform 0.3, 0.3, ($cw / 2), ($wd * 0.33)
  $tg = New-Object Windows.Media.TransformGroup; foreach ($t in $sc, $rt, $mv) { $tg.Children.Add($t) }; $card.RenderTransform = $tg
  Fx-Add $card ($cx - $cw / 2) $top
  $up = New-Object Windows.Media.Animation.BackEase; $up.Amplitude = 0.7; $up.EasingMode = 'EaseOut'
  Anim $mv ([Windows.Media.TranslateTransform]::XProperty) ($x0 - $cx) 0 650 0 $null
  Anim $mv ([Windows.Media.TranslateTransform]::YProperty) ($y0 - $top - $wd * 0.33) 0 650 0 $up
  Anim $sc ([Windows.Media.ScaleTransform]::ScaleXProperty) 0.3 1 500 0 $null; Anim $sc ([Windows.Media.ScaleTransform]::ScaleYProperty) 0.3 1 500 0 $null
  Anim $rt ([Windows.Media.RotateTransform]::AngleProperty) -320 0 650 0 $null
  After 700 { param($rt)
    $x = New-Object Windows.Media.Animation.DoubleAnimation; $x.From = -9; $x.To = 9; $x.Duration = New-Object Windows.Duration ([TimeSpan]::FromMilliseconds(110))
    $x.AutoReverse = $true; $x.RepeatBehavior = New-Object Windows.Media.Animation.RepeatBehavior 4; $rt.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, $x)
  } $rt
  $fade = New-Object Windows.Media.Animation.QuadraticEase; $fade.EasingMode = 'EaseIn'
  Anim $card ([Windows.UIElement]::OpacityProperty) 1 0 450 $hold $fade
  Anim $mv ([Windows.Media.TranslateTransform]::YProperty) 0 -18 450 $hold $null
  Fx-Drop $card ($hold + 500)
}
# Someone's rare catch, said on the floor: it leaps from their feet to over their head.
function Fish-Show($key, $at, $info) {
  if (-not $info -or -not $info.id) { return }
  $wd = Fish-Width $info
  $card = Fish-Card $info $wd @("$($info.mark) $($info.name) · $($info.size)") @()
  $cx = [Math]::Max($wd / 2 + 4, [Math]::Min($S.fxw.Width - $wd / 2 - 4, $at.x))
  Fish-Leap $card ($at.x - $at.size * 0.6) $at.foot $cx ([Math]::Max(4, $at.y - $wd * 0.66 - 30)) $wd 3200
  if ($info.rarity -eq 'legend') { Burst ($cx - 30) ($at.y - 10) 70 600 }
}
# Friends with a line in the water (the hub says so in each one's state) hold a rod on my row.
function Fish-Friends($st) {
  $want = @{}
  foreach ($fr in @($st.friends)) { if ($fr.fishing) { $want["$($fr.floor)|$($fr.who)"] = [int]$fr.rod } }
  foreach ($k in @($S.rods.Keys)) { if (-not $want.ContainsKey($k) -or -not $S.members.Contains($k)) { Rod-Drop $S.rods[$k]; $S.rods.Remove($k) } }
  if (-not $S.fxw -or -not $w.IsVisible) { return }
  foreach ($k in $want.Keys) {
    if ($S.rods.ContainsKey($k) -or -not $S.members.Contains($k)) { continue }
    $m = $S.members[$k]; if (-not $m.img.ActualWidth) { continue }
    Place-Fx; $S.rods[$k] = Rod $m $true $want[$k]; $S.rods[$k].key = $k
  }
}

# 🏆 The picked catch, shown off: the hub says it on the floor and every screen (mine too) puts
# me on the golden stage with it (see Brag).
function Book-RodBrag {
  $r = Ask '/api/fish' @{ floor = $S.bookFloor; op = 'rodbrag' }
  if ($r.error) { Say $S.members[''] '🎣' $r.error 4; return }
  $ui.Book.Visibility = 'Collapsed'
}
function Book-Brag {
  $r = Ask '/api/fish' @{ floor = $S.bookFloor; op = 'brag'; id = $S.bookPick }
  if ($r.error) { Say $S.members[''] '🏆' $r.error 4; return }
  $ui.Book.Visibility = 'Collapsed'
}
# 📖 물고기 도감: every kind on the floor's book, mine in colour and the rest as shadows; a click
# shows one big with what it is, my biggest and the floor's record; the floor's top three under.
function Book-Open {
  $fl = $(if (To) { To } else { $S.floor }); if (-not $fl) { return }
  $S.bookFloor = $fl
  if ($ui.Book.Visibility -ne 'Visible') { $ui.Book.Visibility = 'Visible'; Pop $ui.Book 0 10 }
  $ui.BookTitle.Text = "📖 물고기 도감 · $fl 층"; $ui.BookSum.Text = '불러오는 중…'
  $w.Dispatcher.Invoke([Action] {}, 'Background')
  [void](Fish-Looks)
  $r = Ask '/api/fish' @{ floor = $fl; op = 'book' }
  if ($r.error) { $ui.BookSum.Text = "⚠ $($r.error)"; return }
  $S.book = $r.book
  if (-not $S.bookPick) { $S.bookPick = (@($r.book.list | Where-Object { $_.caught }) | Select-Object -First 1).id }
  if (-not $S.bookTab) { $S.bookTab = $(if ($S.bookPick) { (@($r.book.list | Where-Object { $_.id -eq $S.bookPick }) | Select-Object -First 1).rarity } else { 'common' }) }
  Book-Draw
}
function Book-Draw {
  $bk = $S.book; if (-not $bk) { return }
  $ui.BookSum.Text = "내 도감 $($bk.count) / $($bk.of)종 · 지금까지 $($bk.total)마리"
  # 🎣 My rod on this floor (N강), my ⚒️ points, and whether I can try for the next one now.
  if ($bk.rod) {
    $nx = $bk.rod.next
    $ui.BookSum.Text += "`n🎣 $($bk.rod.step + 1)강 $($bk.rod.name) · ⚒️ 포인트 $($bk.rod.pts)$(if (-not $nx) { ' · 마지막 낚싯대!' } elseif (-not $nx.kindsLeft -and $bk.rod.pts -ge $nx.cost) { ' · 강화 가능!' } elseif ($nx.kindsLeft) { " · 다음 강화까지 $($nx.kindsLeft)종" } else { " · 다음 강화까지 $($nx.cost - $bk.rod.pts)포인트" })"
  }
  # One tab per rarity, each with how many of it I have.
  $ui.BookTabs.Children.Clear()
  foreach ($t in @(@('common', '흔함'), @('uncommon', '가끔'), @('rare', '드묾'), @('epic', '아주'), @('legend', '전설'), @('junk', '꽝'))) {
    $all = @($bk.list | Where-Object { $_.rarity -eq $t[0] }); $got = @($all | Where-Object { $_.caught }).Count; $on = $S.bookTab -eq $t[0]
    $col = $(if ($all.Count) { $all[0].color } else { '#9AA0B5' })
    $tab = New-Object Windows.Controls.Border; $tab.Width = 36; $tab.Margin = New-Object Windows.Thickness 0.5, 0, 0.5, 0; $tab.CornerRadius = New-Object Windows.CornerRadius 5, 5, 0, 0; $tab.Cursor = [Windows.Input.Cursors]::Hand; $tab.Padding = New-Object Windows.Thickness 0, 2, 0, 2
    $tab.Background = $conv.ConvertFrom($(if ($on) { '#3B355A' } else { '#221F33' })); $tab.BorderBrush = $conv.ConvertFrom($(if ($on) { $col } else { '#2E2A45' })); $tab.BorderThickness = New-Object Windows.Thickness 0, 0, 0, 2
    $tb = New-Object Windows.Controls.TextBlock; $tb.TextAlignment = 'Center'; $tb.FontFamily = New-Object Windows.Media.FontFamily 'Malgun Gothic'
    $r1 = New-Object Windows.Documents.Run $t[1]; $r1.FontSize = 10.5; $r1.FontWeight = 'Bold'; $r1.Foreground = $conv.ConvertFrom($col); $tb.Inlines.Add($r1); $tb.Inlines.Add((New-Object Windows.Documents.LineBreak))
    $r2 = New-Object Windows.Documents.Run "$got/$($all.Count)"; $r2.FontSize = 9; $r2.Foreground = $conv.ConvertFrom('#CFC9E6'); $tb.Inlines.Add($r2)
    $tab.Child = $tb; $tab.Tag = $t[0]; $tab.Add_MouseLeftButtonUp({ param($src) $S.bookTab = $src.Tag; Book-Draw })
    [void]$ui.BookTabs.Children.Add($tab)
  }
  $ui.BookGrid.Children.Clear()
  foreach ($e in @($bk.list | Where-Object { $_.rarity -eq $S.bookTab })) {
    $cell = New-Object Windows.Controls.Border; $cell.Width = 43; $cell.Height = 35; $cell.Margin = New-Object Windows.Thickness 1; $cell.CornerRadius = 6; $cell.Cursor = [Windows.Input.Cursors]::Hand
    $cell.Background = $conv.ConvertFrom($(if ($e.caught) { '#2A2640' } else { '#221F33' })); $cell.BorderThickness = $(if ($S.bookPick -eq $e.id) { 2 } else { 1 })
    $cell.BorderBrush = $conv.ConvertFrom($(if ($S.bookPick -eq $e.id) { '#FFFFFF' } elseif ($e.caught) { $e.color } else { '#2E2A45' }))
    $vb = Fish-Visual $e.id 39 (-not $e.caught); if ($vb) { $cell.Child = $vb }
    $cell.ToolTip = $(if ($e.caught) { "$($e.name) · $($e.rarityName)" } else { "??? · $($e.rarityName)" })
    $cell.Tag = $e.id; $cell.Add_MouseLeftButtonUp({ param($src) $S.bookPick = $src.Tag; Book-Draw })
    [void]$ui.BookGrid.Children.Add($cell)
  }
  # The picked one, big.
  $ui.BookDetail.Children.Clear()
  $e = @($bk.list | Where-Object { $_.id -eq $S.bookPick }) | Select-Object -First 1
  if ($e) {
    $vb = Fish-Visual $e.id 84 (-not $e.caught); if ($vb) { $vb.VerticalAlignment = 'Top'; [void]$ui.BookDetail.Children.Add($vb) }
    $tb = New-Object Windows.Controls.TextBlock; $tb.FontFamily = New-Object Windows.Media.FontFamily 'Malgun Gothic'; $tb.TextWrapping = 'Wrap'; $tb.Width = 144; $tb.Margin = New-Object Windows.Thickness 4, 0, 0, 0; $tb.Foreground = [Windows.Media.Brushes]::White
    $r1 = New-Object Windows.Documents.Run "$(if ($e.mark) { "$($e.mark) " })$($e.name)"; $r1.FontSize = 12.5; $r1.FontWeight = 'Bold'; $tb.Inlines.Add($r1)
    $r2 = New-Object Windows.Documents.Run "  $($e.rarityName)"; $r2.FontSize = 11; $r2.Foreground = $conv.ConvertFrom($e.color); $tb.Inlines.Add($r2)
    $more = @()
    if ($e.desc) { $more += $e.desc }
    if ($e.caught) { $more += "$($e.n)마리$(if ($e.best) { " · 최고 $($e.best)" })" }
    if ($e.record) { $more += "🏆 층 최대 $($e.record.size) · $(if ($e.record.me) { '나!' } else { $e.record.name })" }
    if ($e.hint) { $more += $e.hint }
    foreach ($t in $more) { $tb.Inlines.Add((New-Object Windows.Documents.LineBreak)); $r3 = New-Object Windows.Documents.Run $t; $r3.FontSize = 10.5; $r3.Foreground = $conv.ConvertFrom('#CFC9E6'); $tb.Inlines.Add($r3) }
    [void]$ui.BookDetail.Children.Add($tb)
    $ui.BookDetail.Visibility = 'Visible'
  } else { $ui.BookDetail.Visibility = 'Collapsed' }
  $medal = @('🥇', '🥈', '🥉'); $i = 0; $top = @()
  foreach ($p in @($bk.top)) { if ($p) { $top += "$($medal[$i]) $($p.name) $($p.kinds)종$(if ($p.me) { ' ◀' })"; $i++ } }
  $ui.BookTop.Text = $(if ($top.Count) { "층 TOP 3  " + ($top -join '   ') } else { '아직 아무도 못 낚았어요 — 첫 손맛의 주인공이 되어 보세요' })
  $ui.BookButtons.Children.Clear()
  # 🏆 The picked one, if it is mine: up on a stage with it, for the whole floor to see.
  $pick = @($bk.list | Where-Object { $_.id -eq $S.bookPick -and $_.caught }) | Select-Object -First 1
  $buttons = @()
  if ($pick) { $buttons += , @('🏆 자랑하기', { Book-Brag }, '#C9A227') }
  # 🎣 My rod up on the same stage, drawn big.
  if ($bk.rod) { $buttons += , @('🎣 낚싯대 자랑', { Book-RodBrag }, '#B8862B'); $buttons += , @('⚒️ 강화', { Forge-Open }, '#8C5A2E') }
  $buttons += , @('🎣 낚시하기', { $ui.Book.Visibility = 'Collapsed'; if (-not $S.fishLoop) { Fish-Go } }, '#3B7DD8')
  $buttons += , @('닫기', { $ui.Book.Visibility = 'Collapsed' }, '#3B355A')
  foreach ($bt in $buttons) {
    $btn = New-Object Windows.Controls.Button; $btn.Content = $bt[0]; $btn.Tag = $bt[1]; $btn.Margin = New-Object Windows.Thickness 3; $btn.Padding = New-Object Windows.Thickness 10, 4, 10, 4; $btn.BorderThickness = 0
    $btn.FontFamily = New-Object Windows.Media.FontFamily 'Malgun Gothic'; $btn.FontSize = 13; $btn.Cursor = [Windows.Input.Cursors]::Hand
    $btn.Background = $conv.ConvertFrom($bt[2]); $btn.Foreground = [Windows.Media.Brushes]::White; $btn.Add_Click({ param($src) & $src.Tag })
    [void]$ui.BookButtons.Children.Add($btn)
  }
}
# ⚒️ 낚싯대 강화 (/강화, or the menu, or the book): this rod and the next side by side, what I
# have (my step as "N강", points, 장인의 기운, charms) and what the next needs, with its odds.
function Forge-Open {
  $fl = $(if (To) { To } else { $S.floor }); if (-not $fl) { Say $S.members[''] '⚒️' '먼저 층에 들어가야 강화할 수 있어요' 3; return }
  $S.forgeFloor = $fl; $S.forgeNote = $null
  $ui.Book.Visibility = 'Collapsed'
  if ($ui.Forge.Visibility -ne 'Visible') { $ui.Forge.Visibility = 'Visible'; Pop $ui.Forge 0 10 }
  $ui.ForgeTitle.Text = "⚒️ 낚싯대 강화 · $fl 층"; $ui.ForgeSum.Text = '불러오는 중…'; $ui.ForgeText.Text = ''; $ui.ForgeButtons.Children.Clear()
  $w.Dispatcher.Invoke([Action] {}, 'Background')
  $r = Ask '/api/fish' @{ floor = $fl; op = 'book' }
  if ($r.error) { $ui.ForgeSum.Text = "⚠ $($r.error)"; return }
  Forge-Draw $r.book.rod
}
function Forge-Pic($step, $wd) {
  $n = '{0:D2}' -f ([int]$step + 1); $pics = Rod-Pics "rod-$n.png"; $a = Rod-Art
  $g = New-Object Windows.Controls.Grid; $g.Width = $wd; $g.Height = $wd * 190 / 250
  if ($a -and $a.rods[[int]$step].sky) { $sk = Rod-Pics "sky-$n.png"; if ($sk) { $i = New-Object Windows.Controls.Image; $i.Source = $sk[0]; [void]$g.Children.Add($i) } }
  if ($pics) { $i = New-Object Windows.Controls.Image; $i.Source = $pics[0]; [void]$g.Children.Add($i) }
  $g
}
function Forge-Draw($rod) {
  $S.forgeRod = $rod; if (-not $rod) { return }
  $ui.ForgeStage.Children.Clear()
  $row = New-Object Windows.Controls.StackPanel; $row.Orientation = 'Horizontal'; $row.HorizontalAlignment = 'Center'
  [void]$row.Children.Add((Forge-Pic $rod.step 80))
  $nx = $rod.next
  if ($nx) {
    $ar = Fx-Text '→' 18 '#FFD27A'; $ar.VerticalAlignment = 'Center'; [void]$row.Children.Add($ar)
    $np = Forge-Pic ($rod.step + 1) 80; $np.Opacity = 0.85; $S.forgeNext = $np; [void]$row.Children.Add($np)
  }
  [void]$ui.ForgeStage.Children.Add($row)
  $ui.ForgeSum.Text = "지금 $($rod.step + 1)강 $($rod.name)$(if ($rod.up) { " (드문 물고기 +$($rod.up)%)" })`n강화 포인트 $($rod.pts) · 🛡 보호 부적 $($rod.charms)/3 · 도감 $($rod.kinds)종"
  $ui.ForgeGauge.Width = [Math]::Max(0, [Math]::Min(1, $rod.gauge / 100)) * 226
  $ui.ForgeGaugeText.Text = $(if ($nx -and $nx.sure) { '장인의 기운 가득! 다음 강화는 확정 성공' } else { "장인의 기운 $($rod.gauge)%" })
  $lines = @()
  if ($S.forgeNote) { $lines += $S.forgeNote }
  if ($nx) {
    $lines += "다음: $($rod.step + 2)강 $($nx.name)"
    $lines += "필요: 도감 $($nx.need)종$(if ($nx.kindsLeft) { " ($($nx.kindsLeft)종 더)" }) · 포인트 $($nx.cost)$(if ($rod.pts -lt $nx.cost) { " ($($nx.cost - $rod.pts) 모자람)" })"
    $lines += $(if ($nx.sure) { '성공 100% (장인의 기운)' } else { "성공 $($nx.rate)% · 실패 $(100 - $nx.rate - $nx.brk)% · 깨짐 $($nx.brk)%$(if ($nx.brk) { ' (-1 70% · -2 25% · 처음으로 5%)' })$(if ($nx.brk -and $rod.charms) { ' · 🛡 부적이 막아 줘요' })" })
  } else { $lines += '🐉 마지막 낚싯대예요!' }
  $ui.ForgeText.Text = $lines -join "`n"
  $ui.ForgeButtons.Children.Clear()
  $buttons = @()
  if ($nx -and -not $nx.kindsLeft -and $rod.pts -ge $nx.cost) { $buttons += , @("⚒️ 강화하기 (-$($nx.cost))", { Forge-Go }, '#B8862B') }
  $buttons += , @('📖 도감', { $ui.Forge.Visibility = 'Collapsed'; Book-Open }, '#3B7DD8')
  $buttons += , @('닫기', { $ui.Forge.Visibility = 'Collapsed' }, '#3B355A')
  foreach ($bt in $buttons) {
    $btn = New-Object Windows.Controls.Button; $btn.Content = $bt[0]; $btn.Tag = $bt[1]; $btn.Margin = New-Object Windows.Thickness 3; $btn.Padding = New-Object Windows.Thickness 10, 4, 10, 4; $btn.BorderThickness = 0
    $btn.FontFamily = New-Object Windows.Media.FontFamily 'Malgun Gothic'; $btn.FontSize = 13; $btn.Cursor = [Windows.Input.Cursors]::Hand
    $btn.Background = $conv.ConvertFrom($bt[2]); $btn.Foreground = [Windows.Media.Brushes]::White; $btn.Add_Click({ param($src) & $src.Tag })
    [void]$ui.ForgeButtons.Children.Add($btn)
  }
}
# One try: the hub decides at once; the next rod shakes and glows for a moment, then the result
# (success, fail, break, or a break a charm stopped) with what it left me, and its effect over my pet.
function Forge-Go {
  $ui.ForgeButtons.Children.Clear(); $ui.ForgeText.Text = '⚒️ 두근두근…'
  $r = Ask '/api/fish' @{ floor = $S.forgeFloor; op = 'enhance' }
  if ($r.error) { $S.forgeNote = "⚠ $($r.error)"; Forge-Draw $S.forgeRod; return }
  if ($S.forgeNext) {
    $S.forgeNext.RenderTransformOrigin = New-Object Windows.Point 0.5, 0.5
    $sh = New-Object Windows.Media.RotateTransform 0; $S.forgeNext.RenderTransform = $sh
    $x = New-Object Windows.Media.Animation.DoubleAnimation; $x.From = -6; $x.To = 6; $x.Duration = New-Object Windows.Duration ([TimeSpan]::FromMilliseconds(70))
    $x.AutoReverse = $true; $x.RepeatBehavior = New-Object Windows.Media.Animation.RepeatBehavior 8; $sh.BeginAnimation([Windows.Media.RotateTransform]::AngleProperty, $x)
    $S.forgeNext.Effect = New-Object Windows.Media.Effects.DropShadowEffect -Property @{ Color = [Windows.Media.Colors]::Gold; BlurRadius = 16; ShadowDepth = 0; Opacity = 1 }
  }
  After 1200 { param($r)
    $rd = $r.rod
    $left = "남은 포인트 $($rd.pts) · 🛡 $($rd.charms)/3 · 장인의 기운 $($rd.gauge)%"
    $S.forgeNote = switch ($r.result) {
      'success' { "✨ 강화 성공! $($rd.step)강 → $($rd.step + 1)강 $($rd.name)`n$left" }
      'fail' { "😵 강화 실패… 지금 $($rd.step + 1)강 그대로`n$left" }
      'saved' { "🛡 깨질 뻔했는데 보호 부적이 막았어요! 지금 $($rd.step + 1)강 그대로`n$left" }
      'break' { if ($r.zero) { "☠️ 완전 파괴… $($rd.step + 1 + $r.drop)강 → 1강 $($rd.name)`n$left" } elseif ($r.drop -eq 2) { "💥💥 대파괴! $($rd.step + 3)강 → $($rd.step + 1)강 $($rd.name)`n$left" } else { "💥 낚싯대가 깨졌어요… $($rd.step + 2)강 → $($rd.step + 1)강 $($rd.name)`n$left" } }
    }
    Forge-Draw $rd
    Forge-Fx $(if ($r.result -eq 'break' -and ($r.zero -or $r.drop -eq 2)) { 'bigbreak' } else { $r.result })
  } $r
}
# 👋 The first run, in the pet itself (no web page): on a member PC a name, the join code and an
# animal; on the hub PC the owner's name and the first room. The same box later joins another
# room (member) or shows the rooms' join codes and makes new rooms (hub).
function Ask-As($path, $method, $body) {
  $c = New-Object System.Net.WebClient; $c.Encoding = [Text.Encoding]::UTF8
  $c.Headers['Content-Type'] = 'application/json; charset=utf-8'
  try { return ($c.UploadString("$base$path", $method, ($body | ConvertTo-Json -Compress)) | ConvertFrom-Json) }
  catch {
    $msg = '연결되지 않았어요'
    try { $r = New-Object IO.StreamReader($_.Exception.InnerException.Response.GetResponseStream(), [Text.Encoding]::UTF8); $msg = ($r.ReadToEnd() | ConvertFrom-Json).error } catch {}
    return @{ error = $msg }
  }
}
function Start-Text($text, $size = 12, $color = '#FFFFFF', $bold = $false) {
  $t = New-Object Windows.Controls.TextBlock; $t.Text = $text; $t.FontFamily = New-Object Windows.Media.FontFamily 'Malgun Gothic'; $t.FontSize = $size
  $t.Foreground = $conv.ConvertFrom($color); $t.TextWrapping = 'Wrap'; if ($bold) { $t.FontWeight = 'Bold' }; $t.Margin = New-Object Windows.Thickness 0, 6, 0, 2; $t
}
function Start-Box($text, $max) {
  $b = New-Object Windows.Controls.TextBox; $b.Text = $text; $b.MaxLength = $max; $b.FontFamily = New-Object Windows.Media.FontFamily 'Malgun Gothic'; $b.FontSize = 13
  $b.Padding = New-Object Windows.Thickness 5, 3, 5, 3; $b.Background = $conv.ConvertFrom('#2A2640'); $b.Foreground = [Windows.Media.Brushes]::White
  $b.BorderBrush = $conv.ConvertFrom('#7C6CF0'); $b.CaretBrush = [Windows.Media.Brushes]::White; $b
}
# A button that runs $run with $arg (a room, say) when pressed.
function Start-Button($text, $run, $color = '#3B355A', $arg = $null) {
  $btn = New-Object Windows.Controls.Button; $btn.Content = $text; $btn.Tag = @{ run = $run; arg = $arg }; $btn.Margin = New-Object Windows.Thickness 3; $btn.Padding = New-Object Windows.Thickness 12, 5, 12, 5
  $btn.BorderThickness = 0; $btn.FontFamily = New-Object Windows.Media.FontFamily 'Malgun Gothic'; $btn.FontSize = 13; $btn.Cursor = [Windows.Input.Cursors]::Hand
  $btn.Background = $conv.ConvertFrom($color); $btn.Foreground = [Windows.Media.Brushes]::White; $btn.Add_Click({ param($src) & $src.Tag.run $src.Tag.arg }); $btn
}
# Every animal, its face as in the row; the picked one framed.
function Start-Kinds {
  $wp = New-Object Windows.Controls.WrapPanel; $wp.Margin = New-Object Windows.Thickness 0, 2, 0, 0
  foreach ($o in @($S.state.kinds)) {
    $bd = New-Object Windows.Controls.Border; $bd.Width = 36; $bd.Height = 36; $bd.Margin = New-Object Windows.Thickness 1; $bd.CornerRadius = 6; $bd.BorderThickness = 2
    $bd.Cursor = [Windows.Input.Cursors]::Hand; $bd.ToolTip = $o.name; $bd.Tag = $o.kind
    $img = New-Object Windows.Controls.Image; $img.Source = (Frames $o.kind)[0]; $img.Width = 26; $img.Height = 26
    [Windows.Media.RenderOptions]::SetBitmapScalingMode($img, 'NearestNeighbor'); $bd.Child = $img
    $bd.Add_MouseLeftButtonUp({ param($src) $S.start.kind = $src.Tag; Start-Mark })
    [void]$wp.Children.Add($bd)
  }
  $S.start.kinds = $wp; Start-Mark; $wp
}
function Start-Mark {
  foreach ($bd in $S.start.kinds.Children) {
    $on = $bd.Tag -eq $S.start.kind
    $bd.Background = $conv.ConvertFrom($(if ($on) { '#3B355A' } else { '#221F33' })); $bd.BorderBrush = $conv.ConvertFrom($(if ($on) { '#F5C542' } else { '#221F33' }))
  }
}
function Start-Show { if ($ui.Start.Visibility -ne 'Visible') { $ui.Start.Visibility = 'Visible'; Pop $ui.Start 0 10 } }
# mode: 'member' (first run) · 'join' (another room) · 'hub' (the first room) · 'codes' (the rooms).
# member offers two ways in: paste the invite link someone sent, or make this team's first room
# (then this PC is the hub, and the server starts again as one — see Start-Way).
function Start-Open($mode) {
  $S.start = @{ mode = $mode; kind = $S.state.kind; way = 'join' }
  $body = $ui.StartBody; $body.Children.Clear()
  $first = $mode -in 'member', 'hub'
  $ui.StartTitle.Text = switch ($mode) { 'member' { '👋 팀 펫 시작하기' } 'join' { '🔑 다른 방 들어가기' } 'hub' { '🏠 첫 방 만들기' } default { '📋 방 · 참가 코드' } }
  if ($mode -eq 'codes') { Codes-Draw; Start-Show; return }
  $lead = switch ($mode) { 'member' { '팀원이 보낸 참가 링크가 있으면 붙여 넣고, 우리 팀 첫 방이면 새로 만들어요. 방을 만든 PC 가 그 방의 서버가 돼요.' } 'hub' { '이 PC 가 방장입니다. 방을 만들면 팀원에게 보낼 참가 링크가 나와요.' } default { '들어갈 방의 참가 링크를 붙여 넣어 주세요. 이미 들어간 방장의 다른 방이면 코드만 넣어도 돼요.' } }
  [void]$body.Children.Add((Start-Text $lead 11 '#CFC9E6'))
  if ($first) { [void]$body.Children.Add((Start-Text '대화에 보일 내 이름' 11 '#9CD3FF' $true)); $S.start.name = Start-Box "$($S.state.myName)" 30; [void]$body.Children.Add($S.start.name) }
  if ($mode -eq 'member') {
    $ways = New-Object Windows.Controls.WrapPanel; $ways.HorizontalAlignment = 'Center'; $ways.Margin = New-Object Windows.Thickness 0, 6, 0, 0
    $S.start.wayBtns = @{}
    foreach ($o in @(@('join', '🔗 참가 링크로 들어가기'), @('make', '🏠 새 방 만들기'))) { $wb = Start-Button $o[1] { param($way) Start-Way $way } '#221F33' $o[0]; $S.start.wayBtns[$o[0]] = $wb; [void]$ways.Children.Add($wb) }
    [void]$body.Children.Add($ways)
  }
  $S.start.codeLabel = Start-Text $(if ($mode -eq 'hub') { '방 이름 (예: 개발팀)' } else { '참가 링크 (http://… 통째로 붙여 넣기)' }) 11 '#9CD3FF' $true; [void]$body.Children.Add($S.start.codeLabel)
  $S.start.code = Start-Box '' $(if ($mode -eq 'hub') { 30 } else { 200 }); [void]$body.Children.Add($S.start.code)
  $S.start.code.Add_KeyDown({ param($src, $e) if ($e.Key -eq 'Return') { Start-Go } })
  if ($first) { [void]$body.Children.Add((Start-Text '내 동물' 11 '#9CD3FF' $true)); [void]$body.Children.Add((Start-Kinds)) }
  $S.start.note = Start-Text '' 11 '#FFB3AD'; [void]$body.Children.Add($S.start.note)
  $row = New-Object Windows.Controls.WrapPanel; $row.HorizontalAlignment = 'Center'
  $S.start.go = Start-Button $(if ($mode -eq 'hub') { '방 만들기' } else { '들어가기' }) { Start-Go } '#3B7DD8'; [void]$row.Children.Add($S.start.go)
  if (-not $first) { [void]$row.Children.Add((Start-Button '닫기' { $ui.Start.Visibility = 'Collapsed' })) }
  [void]$body.Children.Add($row)
  if ($mode -eq 'member') { Start-Way 'join' }
  # An invite link on the clipboard (copied from the invite page) goes in by itself.
  if ($mode -ne 'hub') {
    $clip = ''; try { $clip = [Windows.Clipboard]::GetText().Trim() } catch {}
    if ($clip -match '^https?://\S+[?&](code|key)=\S+$') { $S.start.code.Text = $clip; $S.start.note.Foreground = $conv.ConvertFrom('#CFC9E6'); $S.start.note.Text = '복사해 둔 참가 링크를 넣어 두었어요. 들어가기를 눌러 주세요.' }
  }
  Start-Show
  $focus = if ($first -and -not $S.start.name.Text) { $S.start.name } else { $S.start.code }
  After 80 { param($t) $w.Activate(); [void]$t.Focus(); [void][Windows.Input.Keyboard]::Focus($t) } $focus
}
# 💨 날리기: the floor sees them fly (Fling-Fx) and land back; one a person in ten seconds.
function Fling-Person($p) {
  $r = Ask '/api/fling' @{ floor = $p.floor; who = $p.who }
  if ($r.error) { Say $S.members[''] '💨' "⚠ $($r.error)" 5 }
}
# 🚪 Out of the room I am in, into another: the hub's owner by their floor's joined flag, a member
# by the room's number. The row changes by itself (doors), the bubble says where I am now.
function Move-Room($room) {
  if ($room.current) { return }
  $r = if ($S.state.hub) { Ask-As '/api/floors' 'PUT' @{ name = $room.name; joined = $true } } else { Ask '/api/links' @{ switch = [int]$room.i } }
  if ($r.error) { Say $S.members[''] '🚪' "⚠ $($r.error)" 5; return }
  $S.pick = $null; $S.linesSig = ''; $S.tabSig = ''
  Say $S.members[''] '🚪' "'$($room.name)' 방으로 이동했어요" 5
}
# 🔗 or 🏠 on the first run: the box asks for the invite link, or for the new room's name.
function Start-Way($way) {
  $st = $S.start; $st.way = $way; $make = $way -eq 'make'
  foreach ($k in @($st.wayBtns.Keys)) { $st.wayBtns[$k].Background = $conv.ConvertFrom($(if ($k -eq $way) { '#3B7DD8' } else { '#221F33' })) }
  $st.codeLabel.Text = $(if ($make) { '방 이름 (예: 개발팀)' } else { '참가 링크 (http://… 통째로 붙여 넣기)' })
  $st.code.MaxLength = $(if ($make) { 30 } else { 200 })
  $st.go.Content = $(if ($make) { '방 만들기' } else { '들어가기' })
  $st.note.Text = ''
}
function Start-Go {
  $st = $S.start; $code = $st.code.Text.Trim(); $name = if ($st.name) { $st.name.Text.Trim() } else { '' }
  $make = $st.mode -eq 'hub' -or ($st.mode -eq 'member' -and $st.way -eq 'make')
  $st.note.Foreground = $conv.ConvertFrom('#FFB3AD')
  if ($st.name -and -not $name) { $st.note.Text = '이름을 적어 주세요'; return }
  if (-not $code) { $st.note.Text = $(if ($make) { '방 이름을 적어 주세요' } else { '참가 링크를 붙여 넣어 주세요' }); return }
  $st.note.Foreground = $conv.ConvertFrom('#CFC9E6'); $st.note.Text = $(if ($make) { '만드는 중…' } else { '방을 찾는 중… (몇 초 걸릴 수 있어요)' })
  $w.Dispatcher.Invoke([Action] {}, 'Background')
  if ($st.kind -and $st.kind -ne $S.state.kind) { Call '/api/pet' @{ kind = $st.kind } | Out-Null }
  if ($make) {
    $r = Ask '/api/config' @{ user = @{ name = $name } }
    if (-not $r.error) { $r = Ask '/api/floors' @{ name = $code } }
  } else {
    $b = @{ code = $code }; if ($name) { $b.name = $name }
    $r = Ask '/api/links' $b
  }
  if ($r.error) { $st.note.Foreground = $conv.ConvertFrom('#FFB3AD'); $st.note.Text = "⚠ $($r.error)"; return }
  if ($st.mode -eq 'hub') { $S.copyInvite = $code; Start-Open 'codes'; return }
  # The first room: the server starts again as the hub, this window leaves with it (the poll
  # watches the parent) and the new one opens with the room's invite link (setup 'codes').
  if ($make) { $st.note.Text = "'$code' 방을 만들었어요! 서버를 다시 켜는 중… 잠시 뒤 펫이 다시 떠요"; return }
  $ui.Start.Visibility = 'Collapsed'
  Say $S.members[''] '👋' "'$($r.joined)' 방에 들어왔어요! 나를 누르면 대화창이 열려요." 10
}
# The hub's rooms: each with its join code (copy, or a fresh one), and a new room.
function Codes-Draw {
  $body = $ui.StartBody; $body.Children.Clear()
  $r = Call '/api/floors'
  # A room just made (Start-Go, or the first room after the restart): its invite link goes straight
  # to the clipboard, ready to paste to the team.
  if ($S.copyInvite -and $r -and $r.floors) {
    $room = if ($S.copyInvite -eq '*') { @($r.floors)[0] } else { @($r.floors | Where-Object { $_.name -eq $S.copyInvite })[0] }
    $S.copyInvite = $null
    if ($room -and $room.invite) { try { [Windows.Clipboard]::SetText($room.invite); Say $S.members[''] '🏠' "'$($room.name)' 방을 만들고 참가 링크를 복사했어요! 팀원에게 붙여 넣어 보내 주세요." 10 } catch { Say $S.members[''] '🏠' "'$($room.name)' 방을 만들었어요! 위 참가 링크를 팀원에게 보내 주세요." 8 } }
  }
  if (-not $r) { [void]$body.Children.Add((Start-Text '⚠ 불러오지 못했어요' 12 '#FFB3AD')); return }
  [void]$body.Children.Add((Start-Text '[🔗 링크 복사] 로 참가 링크를 팀원에게 보내 주세요. 팀원은 펫에 그 링크를 붙여 넣으면 들어옵니다. 7일 동안 쓸 수 있어요.' 11 '#CFC9E6'))
  $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  foreach ($f in @($r.floors)) {
    $card = New-Object Windows.Controls.Border; $card.Background = $conv.ConvertFrom('#2A2640'); $card.CornerRadius = 8; $card.Padding = New-Object Windows.Thickness 8, 4, 8, 6; $card.Margin = New-Object Windows.Thickness 0, 6, 0, 0
    $sp = New-Object Windows.Controls.StackPanel
    $c = "$($f.code)"; $show = if ($c.Length -eq 6) { "$($c.Substring(0, 3))-$($c.Substring(3))" } else { $c }
    $left = [Math]::Ceiling(([double]$f.codeUntil - $now) / 86400000)
    [void]$sp.Children.Add((Start-Text $f.name 12 '#FFFFFF' $true))
    $ct = Start-Text $(if ($left -gt 0) { "$show   · ${left}일 남음" } else { "$show   · 기간 지남" }) 15 $(if ($left -gt 0) { '#FFD166' } else { '#9A93BD' }) $true
    $ct.Margin = New-Object Windows.Thickness 0, 0, 0, 2; [void]$sp.Children.Add($ct)
    $row = New-Object Windows.Controls.WrapPanel
    $room = @{ name = $f.name; code = $show; invite = "$($f.invite)"; live = $left -gt 0 }
    [void]$row.Children.Add((Start-Button '🔗 링크 복사' { param($a) Codes-Copy $a } '#3B7DD8' $room))
    [void]$row.Children.Add((Start-Button '새 코드' { param($a) Codes-Renew $a } '#3B355A' $room))
    [void]$sp.Children.Add($row); $card.Child = $sp; [void]$body.Children.Add($card)
  }
  if (-not @($r.floors).Count) { [void]$body.Children.Add((Start-Text '아직 방이 없어요. 아래에서 만들어 주세요.' 11 '#CFC9E6')) }
  [void]$body.Children.Add((Start-Text '새 방 이름' 11 '#9CD3FF' $true))
  $S.start.code = Start-Box '' 30; [void]$body.Children.Add($S.start.code)
  $S.start.code.Add_KeyDown({ param($src, $e) if ($e.Key -eq 'Return') { Codes-New } })
  $S.start.note = Start-Text '' 11 '#FFB3AD'; [void]$body.Children.Add($S.start.note)
  $row = New-Object Windows.Controls.WrapPanel; $row.HorizontalAlignment = 'Center'
  [void]$row.Children.Add((Start-Button '+ 새 방' { Codes-New } '#3B7DD8'))
  [void]$row.Children.Add((Start-Button '닫기' { $ui.Start.Visibility = 'Collapsed' }))
  [void]$body.Children.Add($row)
}
function Codes-Copy($room) {
  if (-not $room.live) { $S.start.note.Text = "'$($room.name)' 방 코드는 기간이 지났어요. [새 코드] 를 눌러 주세요."; return }
  # The invite link: this PC's address and the code, so the member's pet comes straight here.
  try { [Windows.Clipboard]::SetText($room.invite); Say $S.members[''] '🔗' "'$($room.name)' 방 참가 링크를 복사했어요. 팀원에게 붙여 넣어 보내 주세요" 6 } catch { $S.start.note.Text = "참가 링크: $($room.invite)" }
}
function Codes-Renew($room) {
  $r = Ask-As '/api/floors' 'PUT' @{ name = $room.name; code = $true }
  if ($r.error) { $S.start.note.Text = "⚠ $($r.error)"; return }
  Codes-Draw
  Say $S.members[''] '🔑' "'$($room.name)' 방에 새 코드를 만들었어요. 예전 코드는 이제 안 돼요." 6
}
function Codes-New {
  $name = $S.start.code.Text.Trim(); if (-not $name) { $S.start.note.Text = '방 이름을 적어 주세요'; return }
  $r = Ask '/api/floors' @{ name = $name }
  if ($r.error) { $S.start.note.Text = "⚠ $($r.error)"; return }
  Codes-Draw
}
# Over my pet: gold for a success, a puff for a fail, a shield for a save, shards for a break.
function Forge-Fx($result) {
  if (-not $S.fxw -or -not $w.IsVisible) { return }
  Place-Fx; $at = Fx-At $S.members['']
  switch ($result) {
    'success' {
      # A few gold sparkles; the big gold ring and the shake only for 13강 and up.
      if ($S.forgeRod.step -ge 12) { Legend-Flash $at }
      else { for ($i = 0; $i -lt 8; $i++) { $g = $i * [Math]::PI / 4; Fx-Go (Fx-Text '✦' (8 + $S.rnd.Next(4)) '#FFD666') ($at.x - 4) ($at.y - 6) ([Math]::Cos($g) * 22) ([Math]::Sin($g) * 14) 600 ($i * 20) } }
      Fx-Go (Fx-Text '✨ 강화 성공!' 12 '#FFD666') ($at.x - 34) ($at.y - 34) 0 -14 1300 0
    }
    'fail' { Fx-Go (Fx-Text '💨' 22 '#FFFFFF') ($at.x - 12) ($at.y - 10) 0 -20 900 0; Fx-Go (Fx-Text '😵 실패…' 12 '#CFC9E6') ($at.x - 26) ($at.y - 34) 0 -12 1200 100 }
    'saved' { Fx-Go (Fx-Text '🛡' 24 '#FFFFFF') ($at.x - 12) ($at.y - 30) 0 -14 1200 0; Fx-Go (Fx-Text '막았다!' 12 '#9FD8FF') ($at.x - 20) ($at.y - 46) 0 -12 1200 150 }
    'bigbreak' {
      Fx-Go (Fx-Text '💥💥 대파괴!' 13 '#FF6A4A') ($at.x - 44) ($at.y - 44) 0 -16 1500 0
      for ($i = 0; $i -lt 22; $i++) { $g = $i * [Math]::PI / 11; Fx-Go (Fx-Text '◆' (6 + $S.rnd.Next(6)) $(if ($i % 2) { '#C9CED6' } else { '#FF8A6A' })) ($at.x - 4) ($at.y - 10) ([Math]::Cos($g) * (36 + $S.rnd.Next(26))) ([Math]::Sin($g) * 26 + 26) 900 ($i * 10) }
      Shake-Row
    }
    'break' {
      Fx-Go (Fx-Text '💥 쨍그랑!' 12 '#FF8A6A') ($at.x - 40) ($at.y - 40) 0 -14 1300 0
      for ($i = 0; $i -lt 12; $i++) { $g = $i * [Math]::PI / 6; Fx-Go (Fx-Text '◆' (6 + $S.rnd.Next(5)) '#C9CED6') ($at.x - 4) ($at.y - 10) ([Math]::Cos($g) * (30 + $S.rnd.Next(20))) ([Math]::Sin($g) * 20 + 24) 800 0 }
      Shake-Row
    }
  }
}
$ui.News.Add_MouseLeftButtonUp({ param($src, $e)
  if ($e.OriginalSource -eq $ui.NewsX) { Done-News; return }
  $S.newsOpen = -not $S.newsOpen; News-Text; News-Clock })
$w.Add_Closed({ if ($S.hotkey) { $S.hotkey.Dispose() }; $tray.Visible = $false; $tray.Dispose(); [Windows.Threading.Dispatcher]::CurrentDispatcher.InvokeShutdown() })

# Every 1.5 s: who is here, what they said, pokes; and leave with the server.
$poll = New-Object Windows.Threading.DispatcherTimer; $poll.Interval = [TimeSpan]::FromMilliseconds(1500)
$poll.Add_Tick({
  if (-not (Get-Process -Id $parent)) { $w.Close(); return }
  $st = Call '/api/pet'; if (-not $st) { return }
  if (-not $st.on) { $w.Close(); return }
  $S.state = $st; $S.floor = $st.floor; Cast $st; $me = $S.members['']
  # A size set from the menu or another window of mine; never while I am dragging.
  if (-not $S.rz -and $st.scale -and [Math]::Abs($st.scale - $S.k) -gt 0.005) { Zoom $st.scale }
  if (-not $S.aDrag -and $null -ne $st.petAlpha -and [Math]::Abs($st.petAlpha - $S.petA) -gt 0.01) { Pet-Alpha $st.petAlpha }
  if (-not $S.crz -and -not $S.cDrag -and $st.chatW -and ($st.chatW -ne $S.chatW -or $st.chatH -ne $S.chatH -or [Math]::Abs($st.chatAlpha - $S.chatA) -gt 0.01)) { Chat-Size $st.chatW $st.chatH $st.chatAlpha }
  if ($null -ne $st.x -and $S.first) { $S.right = $st.x; $S.bottom = $st.y; if (-not (Fit-Screen)) { Anchor } }
  foreach ($m in $st.chat) {
    if ($S.seen.ContainsKey($m.id)) { continue }; $S.seen[$m.id] = 1
    if ($S.first) { continue }
    $at = "$($m.floor)|$($m.who)"; $who = if ($m.mine) { '' } elseif ($S.members.Contains($at)) { $at } else { $null }
    # 🎆 An effect plays over whoever sent it instead of a bubble; the chat box still has the line.
    # My own catch already leapt over me when I reeled it in.
    if ($m.fx -eq 'fish' -and $m.mine) { continue }
    # 🦶 Sent flying myself: that one plays even with others' effects off.
    if ($m.fx -eq 'smack' -and $m.mine -and ((Get-Date) - $S.smkSent).TotalSeconds -lt 15) { continue }
    if ($m.fx) { if ($null -ne $who -and ($m.mine -or (($m.fx -eq 'smack' -or $m.fx -eq 'snowball') -and $m.fish.me) -or -not $st.fxOff)) { Play-Fx $m.fx $who $(if ($m.fling) { $m.fling } else { $m.fish }) }; continue }
    if (-not $st.bubbles -and -not $m.mine) { if ($ui.Chat.Visibility -ne 'Visible') { $me.dot.Visibility = 'Visible' }; continue }
    if ($null -ne $who) { Say $S.members[$who] $(if ($m.mine) { '나' } else { $m.name }) $m.text 8 '' $m.img ([bool]$m.me) } else { Say $me $m.name $m.text 8 '' $m.img ([bool]$m.me) }
  }
  # A note to me: a lilac bubble over the writer (or over me when they are not on my row),
  # shown even with bubbles off since it is only mine; a click on it opens the answer.
  foreach ($n in $st.notes) {
    if ($S.seen.ContainsKey($n.id)) { continue }; $S.seen[$n.id] = 1
    if ($S.first -or $n.dir -ne 'in') { continue }
    $at = "$($n.floor)|$($n.who)"; $over = if ($S.members.Contains($at)) { $S.members[$at] } else { $me }
    $text = if ($n.text) { "✉️ $($n.text)" } else { '✉️ (사진)' }
    Say $over "$($n.name) 님의 쪽지" $text 12 @{ who = $n.who; name = $n.name; floor = $n.floor } $n.img 'note'
  }
  if ($ui.Chat.Visibility -eq 'Visible') { Show-Chat }
  Show-Duel $st.duel
  Show-Relay $st.relay
  Show-Party $st.party
  Show-Contest $st.contest; Contest-Auto
  Fish-Friends $st
  # 👋 Not set up yet: the first-run box opens by itself, once (the menu opens it again).
  if ($st.setup -and -not $S.startAuto -and $w.IsVisible) { $S.startAuto = $true; if ($st.setup -eq 'codes') { $S.copyInvite = '*' }; Start-Open $st.setup }
  # 📦 A new update's notes once the pets are in sight; folded and untouched, they go by themselves.
  if ($st.news -and $st.news.fresh -and -not $st.setup -and $S.newsShown -ne $st.news.n -and $w.IsVisible) { $S.newsShown = $st.news.n; Show-News $st.news $false }
  # 🆕 A newer release (once per version, until 나중에), and a room's hub older than me (said once).
  if ($st.update -and -not $st.update.mac -and -not $st.setup -and $S.updLater -ne [string]$st.update.version -and $ui.Upd.Visibility -ne 'Visible' -and $w.IsVisible) { Show-Update $st.update }
  if ($st.hubOld -and -not $S.hubOldSaid -and -not $S.first) { $S.hubOldSaid = $true; Say $S.members[''] '🆕' '방장 PC 가 아직 옛 버전이에요. 방장 PC 가 업데이트하면 새 기능이 다 돼요.' 8 }
  if ($ui.News.Visibility -eq 'Visible' -and -not $ui.News.IsMouseOver -and (Get-Date) -gt $S.newsUntil) { Done-News }
  # 🚧 A room that came down under me (its owner deleted it), once: a shake and a word.
  foreach ($l in @($st.lost)) {
    $lid = "lost|$($l.name)|$($l.at)"; if ($S.seen.ContainsKey($lid)) { continue }; $S.seen[$lid] = 1
    if (-not $S.first) { Flinch; Say $me '🚪' "'$($l.name)' 방이 사라졌어요! 방장이 방을 없앴어요." 10 }
  }
  # Poked: a jump, a good shake and a bubble that says so. Called by name: the same jump and
  # shake, while the caller's yellow line says the rest.
  if ($S.pokes -ge 0 -and $st.pokes -gt $S.pokes) { Flinch; Say $me '👉' '누가 찔렀어요!' 3 }
  if ($null -ne $S.calls -and $st.calls -gt $S.calls) { Flinch }
  $S.pokes = $st.pokes; $S.calls = [int]$st.calls
  $S.first = $false
})

# Every 0.2 s: each pet breathes on its own beat, blinks now and then, chatters
# while its bubble is fresh; mine shakes when I am poked.
# Poked or called: my pet hops up and comes down, then shakes for two seconds.
function Flinch {
  $S.shakeUntil = (Get-Date).AddMilliseconds(2000)
  $t = New-Object Windows.Media.TranslateTransform; $S.members[''].g.RenderTransform = $t
  Anim $t ([Windows.Media.TranslateTransform]::YProperty) 0 -16 160 0 $null
  After 180 { param($t) Anim $t ([Windows.Media.TranslateTransform]::YProperty) -16 0 300 0 $null } $t
}
$anim = New-Object Windows.Threading.DispatcherTimer; $anim.Interval = [TimeSpan]::FromMilliseconds(200)
$rand = New-Object Random
$anim.Add_Tick({
  $S.tick++; $now = Get-Date
  # 🎨 the seconds left on my turn.
  if ($S.relay -and ($S.relay.myTurn -or ($S.relay.mode -eq 'catch' -and $S.relay.phase -ne 'done' -and $S.relay.phase -ne 'lobby')) -and $S.relayEnds -and $ui.Relay.Visibility -eq 'Visible') {
    $ui.RelayTitle.Text = "$($S.relayTitle) · ⏱ $([Math]::Max(0, [int][Math]::Ceiling(($S.relayEnds - $now).TotalSeconds)))초"
  }
  foreach ($m in $S.members.Values) {
    if ($m.bub.Visibility -eq 'Visible' -and $now -gt $m.until) { $m.bub.Visibility = 'Collapsed' }
    $f = if (($S.tick + $m.phase * 2) % 6 -lt 3) { 0 } else { 1 }
    if ($rand.Next(30) -eq 0) { $f = 2 }
    if ($m.bub.Visibility -eq 'Visible' -and $now -lt $m.until.AddSeconds(-5)) { $f = @(0, 3)[$S.tick % 2] }
    $dx = 0
    if (-not $m.who -and $now -lt $S.shakeUntil) { $f = 3; $dx = @(-6, 6)[$S.tick % 2] }
    if ((-not $m.who -and $S.walking) -or $now -lt $m.walkUntil) { $f = @(0, 1)[$S.tick % 2] }
    $m.img.Source = $m.frames[$f]; $m.img.Margin = New-Object Windows.Thickness $dx, 0, (-$dx), 0
  }
  Fx-Follow; Fx-Tick; Wx-Tick; Snow-Tick; Freeze-Tick; Fish-Tick
})

$st = Call '/api/pet'
if ($st -and $null -ne $st.x) { $S.right = $st.x; $S.bottom = $st.y }
$S.fly = $true
if ($st) { $S.state = $st; Cast $st; if ($st.scale) { Zoom $st.scale }; if ($st.chatW) { Chat-Size $st.chatW $st.chatH $st.chatAlpha }; if ($st.petAlpha) { Pet-Alpha $st.petAlpha } } else { $S.members[''] = Member '' '나' 'cat' 48 '' $ui.Row }
$w.Show(); [void](Fit-Screen); if ($S.fly) { Fly } else { Anchor }; Place-Fx; $poll.Start(); $anim.Start()
[Windows.Threading.Dispatcher]::Run()
