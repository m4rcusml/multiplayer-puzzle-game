# Autoridade da sala, colisão e sincronização do puzzle

## Objetivo

Tornar o estado multiplayer da sala autoritativo no servidor, evitando
sobreposição nas bordas e entre grupos, impedindo edição concorrente da mesma
peça/grupo e sincronizando host, senha e visibilidade dos números.

## Modelo de estado

Cada sala terá:

- `hostId`: socket atualmente responsável pelas configurações da sala;
- `showLabels`: inicia como `false`;
- `password`: permanece apenas no servidor e é enviada somente ao host;
- bloqueios temporários por grupo, associados ao socket que iniciou o arraste.

O objeto público da sala não conterá a senha. Ao criar/entrar, o servidor
retornará `isHost`; o host receberá também a senha. Se o host desconectar, o
servidor escolherá outro socket participante, enviará `host_changed` com a
senha somente ao novo host e notificará os demais sobre a nova autoridade.

## Protocolo Socket.IO

Serão adicionados eventos `claim_group` e `release_group`. Movimentos só serão
aceitos quando o socket possuir o bloqueio correspondente. O servidor emitirá
as posições aceitas e rejeitará reivindicações concorrentes.

O evento `set_labels_visibility` será aceito apenas pelo host e propagará
`labels_visibility_changed` para todos. O cliente iniciará com os rótulos
ocultos e só renderizará o controle de alternância para o host.

## Geometria

O servidor tratará cada peça como um retângulo com largura `0.7 / columns` e
altura `0.7 / rows`. Para um movimento de grupo, calculará o bounding box do
grupo, limitará o deslocamento à área `0..1` e recusará deslocamentos que
intersectem peças de outros grupos. O cliente aplicará o mesmo limite para
feedback imediato, mas o estado emitido pelo servidor será a fonte final.

Ao conectar grupos, as peças serão reposicionadas pelo deslocamento entre
`targetX`/`targetY` das peças adjacentes. Assim, a distância entre peças
conectadas corresponde exatamente às dimensões da grade e não há sobreposição.

## Interface

O jogo terá botão “Sair da sala”, que libera o arraste, desconecta o socket e
retorna ao lobby. O host verá um campo somente leitura com a senha e um
controle de mostrar/ocultar. Participantes comuns não receberão nem verão
esse campo.

## Verificação

Adicionar testes para bounding boxes, limites, interseção, encaixe adjacente,
posse exclusiva, autorização do host, transferência de host e visibilidade
dos rótulos. Validar também o build do backend e do frontend.
